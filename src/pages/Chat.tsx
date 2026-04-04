import React, {useCallback, useEffect, useRef, useState} from 'react'
import AppLayout from "../components/layout/AppLayout.jsx";
import {IconButton, Skeleton, Stack} from "@mui/material";
import {AttachFile as AttachFileIcon, Send as SendIcon} from "@mui/icons-material";
import {InputBox} from "../components/styles/StyledComponents.jsx";
import FileMenu from "../components/dialogs/FileMenu.jsx";
import MessageComponent from "../components/shared/MessageComponent.jsx";
import {getSocket} from "../socket.jsx";
import {ALERT, CHAT_JOINED, CHAT_LEFT, NEW_MESSAGE, START_TYPING, STOP_TYPING} from "../constants/events.constant.js";
import {useChatDetailsQuery, useGetMessagesQuery} from "../redux/api/apiSlice.js";
import {useErrors, useSockets} from "../hooks/hook.jsx";
import {useInfiniteScrollTop} from "../hooks/useInfiniteScroll";
import {useDispatch} from "react-redux";
import {setIsFileMenu} from "../redux/reducers/miscSlice.js";
import {sout} from "../utils/helper.js";
import {resetNewMessagesAlert} from "../redux/reducers/chatSlice.js";
import {TypingLoader} from "../components/layout/Loaders.jsx";
import {useNavigate} from "react-router-dom";
import {userTheme} from "../constants/userTheme.constant.js";
import {decryptMessageContent, encryptTextMessage} from "../lib/e2ee";
import toast from "react-hot-toast";


const Chat = ({ChatId, user}) => {


  const socket = getSocket();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const containerRef = useRef(null);
  const bottomRef = useRef(null);

  const [iAmTyping, setIAmTyping] = useState(false);
  const [userTyping, setUserTyping] = useState(false);
  const typingTimeout = useRef(null);

  const [page, setPage] = useState(1);
  const [messageTyped, setMessageTyped] = useState("");
  const [messages, setMessages] = useState([]);
  const [fileMenuAnchor, setFileMenuAnchor] = useState(null);

  const chatDetails = useChatDetailsQuery({ChatId, populate: true}, {skip: !ChatId});
  const members = chatDetails?.data?.chat?.members;

  const prevMessagesChunk = useGetMessagesQuery({ChatId, page});

  const errors = [
    {isError: chatDetails.isError, error: chatDetails.error},
    {isError: prevMessagesChunk.isError, error: prevMessagesChunk.error}
  ]

  const {data: prevMessages, setData: setPrevMessages} = useInfiniteScrollTop(
    containerRef,
    prevMessagesChunk.data?.totalPages,
    page,
    setPage
  );

  const messageOnChangeHandler = (e) => {
    setMessageTyped(e.target.value);
    if (!iAmTyping) {
      socket.emit(START_TYPING, {members, ChatId});
      setIAmTyping(true);
      sout("I am typing...")
    }

    if (typingTimeout.current) clearTimeout(typingTimeout.current);

    typingTimeout.current = setTimeout(() => {
      socket.emit(STOP_TYPING, {members, ChatId});
      setIAmTyping(false);
      sout("I stopped typing...")
    }, [2000]);
  };

  const handleFileOpen = (e) => {
    dispatch(setIsFileMenu(true));
    setFileMenuAnchor(e.currentTarget);
  }

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!messageTyped.trim()) return;
    if (!members?.length) {
      toast.error("Secure chat is still loading. Please try again in a moment.");
      return;
    }

    (async () => {
      try {
        const encryptedMessage = await encryptTextMessage({
          text: messageTyped,
          members: members || [],
        });

        socket.emit(NEW_MESSAGE, {ChatId, members, message: encryptedMessage});
        setMessageTyped("");
      } catch (error: any) {
        toast.error(error?.message || "Unable to send secure message right now.");
      }
    })();
  }

  useEffect(() => {
    if (members?.length) {
      socket.emit(CHAT_JOINED, {userId: user._id, members});
    }
    dispatch(resetNewMessagesAlert(ChatId));

    return () => {
      setMessages([]);
      setPage(1);
      setMessageTyped("");
      setPrevMessages([]);
      if (members?.length) {
        socket.emit(CHAT_LEFT, {userId: user._id, members});
      }
    }
  }, [ChatId, members]);

  useEffect(() => {
    bottomRef?.current?.scrollIntoView({behavior: "smooth"});
  }, [messages]);

  useEffect(() => {
    if (chatDetails.isError) return navigate("/");
  }, [chatDetails.isError]);

  useEffect(() => {
    if (!prevMessagesChunk.data?.messages?.length || !user?._id) return;

    (async () => {
      const decryptedMessages = await Promise.all(
        prevMessagesChunk.data.messages.map((message) => decryptMessageContent({message, userId: user._id}))
      );

      setPrevMessages((prev) => [...prev, ...decryptedMessages]);
    })();
  }, [prevMessagesChunk.data?.messages, setPrevMessages, user?._id]);

  const newMessagesListener = useCallback((data) => {
    if (data.ChatId !== ChatId) return;

    (async () => {
      const decryptedMessage = await decryptMessageContent({message: data.message, userId: user._id});
      setMessages(prevState => prevState.concat(decryptedMessage))
    })();
  }, [ChatId, user?._id]);

  const startTypingListener = useCallback((data) => {
    if (data.ChatId !== ChatId) return;
    setUserTyping(true);
    sout("User is typing...", data);
  }, [ChatId]);

  const stopTypingListener = useCallback((data) => {
    if (data.ChatId !== ChatId) return;
    setUserTyping(false);
    sout("User stopped typing...", data);
  }, [ChatId]);

  const alertListener = useCallback((data) => {
    sout("Alert Listener: ", data)
    if (data.ChatId !== ChatId) return;
    const messageForAlert = {
      content: data.message,
      sender: {
        _id: "This_Is_An_Alert_Message_s_Id",
        name: "Admin",
      },
      chat: data.ChatId,
      createdAt: new Date().toISOString(),
    };
    setMessages(prevState => [...prevState, messageForAlert]);
  }, [ChatId])

  const eventHandler = {
    [ALERT]: alertListener,
    [NEW_MESSAGE]: newMessagesListener,
    [START_TYPING]: startTypingListener,
    [STOP_TYPING]: stopTypingListener
  };

  useSockets(socket, eventHandler);

  useErrors(errors);

  const allMessages = [...prevMessages, ...messages];

  return chatDetails.isLoading ? <Skeleton/> : (
    <>
      {/*Messages Render*/}
      <Stack
        ref={containerRef}
        boxSizing="border-box"
        padding={"1rem"}
        spacing={"1rem"}
        bgcolor={"rgba(8, 15, 25, 0.46)"}
        height={"90%"}
        sx={{
          overflowX: "hidden",
          overflowY: "auto",
        }}
      >
        {
          allMessages
            ?.map((msg) =>
              <MessageComponent
                key={msg._id}
                message={msg}
                loggedUser={user}
              />
            )
        }
        {userTyping && <TypingLoader/>}
        <div ref={bottomRef}/>
      </Stack>

      {/*Input*/}
      <form
        style={{
          height: `10%`,
        }}
        onSubmit={handleSubmit}
      >
        <Stack
          direction='row'
          height="100%"
          padding="1rem"
          alignItems="center"
          position="relative"
        >

          <IconButton
            sx={{
              position: "absolute",
              left: "1.5rem",
              rotate: "20deg",
              color: userTheme.textMuted,
            }}
            onClick={handleFileOpen}
          >
            <AttachFileIcon/>
          </IconButton>

          <InputBox
            placeholder={"Type a message..."}
            value={messageTyped}
            onChange={messageOnChangeHandler}
          />
          <IconButton
            type="submit"
            sx={{
              rotate: "-25deg",
              background: "linear-gradient(135deg, #5eead4 0%, #38bdf8 100%)",
              color: "#041019",
              marginLeft: "1rem",
              padding: "0.5rem",
              "&:hover": {
                background: "linear-gradient(135deg, #99f6e4 0%, #67e8f9 100%)",
              }
            }}
          >
            <SendIcon/>
          </IconButton>
        </Stack>
      </form>
      <FileMenu anchorE1={fileMenuAnchor} ChatId={ChatId}/>
    </>
  )
}
export default AppLayout()(Chat);
