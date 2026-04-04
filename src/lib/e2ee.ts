import axios from "axios";

const KEY_ALGORITHM = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
} as const;

const privateKeyStorageKey = (userId: string) => `noviconnect:e2ee:private:${userId}`;
const publicKeyStorageKey = (userId: string) => `noviconnect:e2ee:public:${userId}`;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  let binary = "";
  const bytes = new Uint8Array(buffer);

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
};

const base64ToArrayBuffer = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
};

const exportPublicKey = async (key: CryptoKey) => arrayBufferToBase64(await crypto.subtle.exportKey("spki", key));
const exportPrivateKey = async (key: CryptoKey) => arrayBufferToBase64(await crypto.subtle.exportKey("pkcs8", key));

const importPublicKey = async (key: string) =>
  crypto.subtle.importKey("spki", base64ToArrayBuffer(key), KEY_ALGORITHM, true, ["encrypt"]);

const importPrivateKey = async (key: string) =>
  crypto.subtle.importKey("pkcs8", base64ToArrayBuffer(key), KEY_ALGORITHM, true, ["decrypt"]);

const loadLocalIdentity = async (userId: string) => {
  const privateKey = localStorage.getItem(privateKeyStorageKey(userId));
  const publicKey = localStorage.getItem(publicKeyStorageKey(userId));

  if (!privateKey || !publicKey) return null;

  return {privateKey, publicKey};
};

const createAndStoreLocalIdentity = async (userId: string) => {
  const keyPair = await crypto.subtle.generateKey(KEY_ALGORITHM, true, ["encrypt", "decrypt"]);
  const [publicKey, privateKey] = await Promise.all([
    exportPublicKey(keyPair.publicKey),
    exportPrivateKey(keyPair.privateKey),
  ]);

  localStorage.setItem(privateKeyStorageKey(userId), privateKey);
  localStorage.setItem(publicKeyStorageKey(userId), publicKey);

  return {privateKey, publicKey};
};

const getPrivateKey = async (userId: string) => {
  const identity = await loadLocalIdentity(userId);
  if (!identity) throw new Error("Encrypted messages are unavailable on this device.");
  return importPrivateKey(identity.privateKey);
};

export const ensureUserEncryptionSetup = async ({
  user,
  server,
}: {
  user: {_id: string; encryptionPublicKey?: string};
  server: string;
}) => {
  if (!user?._id) return null;

  const identity = (await loadLocalIdentity(user._id)) || (await createAndStoreLocalIdentity(user._id));

  if (user.encryptionPublicKey !== identity.publicKey) {
    const {data} = await axios.put(
      `${server}/api/v1/user/encryption-key`,
      {encryptionPublicKey: identity.publicKey},
      {withCredentials: true}
    );

    return data.user;
  }

  return null;
};

export const encryptTextMessage = async ({
  text,
  members,
}: {
  text: string;
  members: Array<{_id: string; encryptionPublicKey?: string}>;
}) => {
  if (!text.trim()) throw new Error("Message cannot be empty.");

  const unavailableMember = members.find((member) => !member.encryptionPublicKey);
  if (unavailableMember) {
    throw new Error("One or more chat members have not finished secure-message setup yet.");
  }

  const symmetricKey = await crypto.subtle.generateKey({name: "AES-GCM", length: 256}, true, ["encrypt", "decrypt"]);
  const rawSymmetricKey = await crypto.subtle.exportKey("raw", symmetricKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {name: "AES-GCM", iv},
    symmetricKey,
    textEncoder.encode(text)
  );

  const encryptedKeys = await Promise.all(
    members.map(async (member) => {
      const importedKey = await importPublicKey(member.encryptionPublicKey as string);
      const encryptedKey = await crypto.subtle.encrypt({name: "RSA-OAEP"}, importedKey, rawSymmetricKey);

      return {
        userId: member._id,
        key: arrayBufferToBase64(encryptedKey),
      };
    })
  );

  return {
    version: 1,
    algorithm: "AES-GCM",
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer),
    encryptedKeys,
  };
};

export const decryptMessageContent = async ({
  message,
  userId,
}: {
  message: any;
  userId: string;
}) => {
  if (!message?.encryptedContent?.ciphertext) return message;

  try {
    const privateKey = await getPrivateKey(userId);
    const encryptedKey = message.encryptedContent.encryptedKeys?.find(
      (entry: any) => entry.userId?.toString?.() === userId || entry.userId === userId
    );

    if (!encryptedKey?.key) {
      return {
        ...message,
        content: "Encrypted message unavailable on this device.",
      };
    }

    const rawSymmetricKey = await crypto.subtle.decrypt(
      {name: "RSA-OAEP"},
      privateKey,
      base64ToArrayBuffer(encryptedKey.key)
    );
    const symmetricKey = await crypto.subtle.importKey(
      "raw",
      rawSymmetricKey,
      {name: "AES-GCM"},
      false,
      ["decrypt"]
    );
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(base64ToArrayBuffer(message.encryptedContent.iv)),
      },
      symmetricKey,
      base64ToArrayBuffer(message.encryptedContent.ciphertext)
    );

    return {
      ...message,
      content: textDecoder.decode(plaintext),
    };
  } catch (error) {
    return {
      ...message,
      content: "Encrypted message unavailable on this device.",
    };
  }
};
