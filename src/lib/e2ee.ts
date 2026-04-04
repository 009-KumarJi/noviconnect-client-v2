import axios from "axios";

const KEY_ALGORITHM = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
} as const;

const WRAP_ALGORITHM = {name: "AES-GCM", length: 256} as const;
const KDF_ITERATIONS = 250000;

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

const importPasswordMaterial = (password: string) =>
  crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveKey"]);

const deriveWrapKey = async ({
  password,
  salt,
  iterations,
}: {
  password: string;
  salt: Uint8Array;
  iterations: number;
}) => {
  const material = await importPasswordMaterial(password);

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    material,
    WRAP_ALGORITHM,
    false,
    ["encrypt", "decrypt"]
  );
};

const loadLocalIdentity = async (userId: string) => {
  const privateKey = localStorage.getItem(privateKeyStorageKey(userId));
  const publicKey = localStorage.getItem(publicKeyStorageKey(userId));

  if (!privateKey || !publicKey) return null;

  return {privateKey, publicKey};
};

const storeLocalIdentity = ({userId, privateKey, publicKey}: {userId: string; privateKey: string; publicKey: string}) => {
  localStorage.setItem(privateKeyStorageKey(userId), privateKey);
  localStorage.setItem(publicKeyStorageKey(userId), publicKey);
};

const createAndStoreLocalIdentity = async (userId: string) => {
  const keyPair = await crypto.subtle.generateKey(KEY_ALGORITHM, true, ["encrypt", "decrypt"]);
  const [publicKey, privateKey] = await Promise.all([
    exportPublicKey(keyPair.publicKey),
    exportPrivateKey(keyPair.privateKey),
  ]);

  storeLocalIdentity({userId, privateKey, publicKey});

  return {privateKey, publicKey};
};

const getPrivateKey = async (userId: string) => {
  const identity = await loadLocalIdentity(userId);
  if (!identity) throw new Error("Encrypted messages are unavailable on this device.");
  return importPrivateKey(identity.privateKey);
};

const createEncryptedPrivateKeyBundle = async ({
  privateKey,
  password,
}: {
  privateKey: string;
  password: string;
}) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapKey = await deriveWrapKey({
    password,
    salt,
    iterations: KDF_ITERATIONS,
  });
  const encryptedPrivateKey = await crypto.subtle.encrypt(
    {name: "AES-GCM", iv},
    wrapKey,
    base64ToArrayBuffer(privateKey)
  );

  return {
    encryptedPrivateKeyBundle: arrayBufferToBase64(encryptedPrivateKey),
    encryptionBundleIv: arrayBufferToBase64(iv.buffer),
    encryptionBundleSalt: arrayBufferToBase64(salt.buffer),
    encryptionBundleIterations: KDF_ITERATIONS,
    encryptionKeyVersion: 1,
  };
};

const decryptPrivateKeyBundle = async ({
  encryptedPrivateKeyBundle,
  encryptionBundleIv,
  encryptionBundleSalt,
  encryptionBundleIterations,
  password,
}: {
  encryptedPrivateKeyBundle: string;
  encryptionBundleIv: string;
  encryptionBundleSalt: string;
  encryptionBundleIterations: number;
  password: string;
}) => {
  const iv = new Uint8Array(base64ToArrayBuffer(encryptionBundleIv));
  const salt = new Uint8Array(base64ToArrayBuffer(encryptionBundleSalt));
  const wrapKey = await deriveWrapKey({
    password,
    salt,
    iterations: Number(encryptionBundleIterations) || KDF_ITERATIONS,
  });
  const decryptedKey = await crypto.subtle.decrypt(
    {name: "AES-GCM", iv},
    wrapKey,
    base64ToArrayBuffer(encryptedPrivateKeyBundle)
  );

  return arrayBufferToBase64(decryptedKey);
};

const saveEncryptionBundle = async ({
  server,
  encryptionPublicKey,
  privateKey,
  password,
}: {
  server: string;
  encryptionPublicKey: string;
  privateKey: string;
  password: string;
}) => {
  const bundle = await createEncryptedPrivateKeyBundle({privateKey, password});

  await axios.put(
    `${server}/api/v1/user/encryption-bundle`,
    {
      encryptionPublicKey,
      ...bundle,
    },
    {withCredentials: true}
  );
};

export const ensureUserEncryptionSetup = async ({
  user,
  server,
  password,
}: {
  user: {_id: string; encryptionPublicKey?: string};
  server: string;
  password?: string;
}) => {
  if (!user?._id) return null;

  const localIdentity = await loadLocalIdentity(user._id);
  if (localIdentity) {
    if (user.encryptionPublicKey !== localIdentity.publicKey && password) {
      await saveEncryptionBundle({
        server,
        encryptionPublicKey: localIdentity.publicKey,
        privateKey: localIdentity.privateKey,
        password,
      });
    }

    return {
      restoredFromBundle: false,
      uploadedBundle: Boolean(password && user.encryptionPublicKey !== localIdentity.publicKey),
    };
  }

  const {data} = await axios.get(`${server}/api/v1/user/encryption-bundle`, {withCredentials: true});
  const bundle = data?.encryptionBundle;

  if (bundle?.encryptedPrivateKeyBundle && password) {
    const privateKey = await decryptPrivateKeyBundle({
      encryptedPrivateKeyBundle: bundle.encryptedPrivateKeyBundle,
      encryptionBundleIv: bundle.encryptionBundleIv,
      encryptionBundleSalt: bundle.encryptionBundleSalt,
      encryptionBundleIterations: bundle.encryptionBundleIterations,
      password,
    });

    storeLocalIdentity({
      userId: user._id,
      privateKey,
      publicKey: bundle.encryptionPublicKey,
    });

    return {restoredFromBundle: true, uploadedBundle: false};
  }

  if (!password) {
    return {restoredFromBundle: false, uploadedBundle: false};
  }

  const identity = await createAndStoreLocalIdentity(user._id);
  await saveEncryptionBundle({
    server,
    encryptionPublicKey: identity.publicKey,
    privateKey: identity.privateKey,
    password,
  });

  return {restoredFromBundle: false, uploadedBundle: true};
};

export const rewrapEncryptionBundle = async ({
  userId,
  currentPassword,
  newPassword,
  server,
}: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  server: string;
}) => {
  if (!userId) throw new Error("User not available for encryption key rotation.");

  let identity = await loadLocalIdentity(userId);

  if (!identity) {
    const {data} = await axios.get(`${server}/api/v1/user/encryption-bundle`, {withCredentials: true});
    const bundle = data?.encryptionBundle;

    if (!bundle?.encryptedPrivateKeyBundle) {
      throw new Error("No encrypted private key bundle found for this account.");
    }

    const privateKey = await decryptPrivateKeyBundle({
      encryptedPrivateKeyBundle: bundle.encryptedPrivateKeyBundle,
      encryptionBundleIv: bundle.encryptionBundleIv,
      encryptionBundleSalt: bundle.encryptionBundleSalt,
      encryptionBundleIterations: bundle.encryptionBundleIterations,
      password: currentPassword,
    });

    identity = {
      privateKey,
      publicKey: bundle.encryptionPublicKey,
    };

    storeLocalIdentity({userId, ...identity});
  }

  await saveEncryptionBundle({
    server,
    encryptionPublicKey: identity.publicKey,
    privateKey: identity.privateKey,
    password: newPassword,
  });
};

export const clearEncryptionIdentity = (userId?: string) => {
  if (!userId) return;
  localStorage.removeItem(privateKeyStorageKey(userId));
  localStorage.removeItem(publicKeyStorageKey(userId));
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
