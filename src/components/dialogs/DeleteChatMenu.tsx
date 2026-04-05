import React, {useEffect} from 'react';
import {Menu, Stack, Typography} from "@mui/material";
import {setIsDeleteMenu} from "../../redux/reducers/miscSlice.js";
import {useSelector} from "react-redux";
import {ExitToApp as LeaveGroupIcon, PersonRemove as FriendRemoveIcon} from "@mui/icons-material";
import {useNavigate} from "react-router-dom";
import {useAsyncMutation} from "../../hooks/hook.jsx";
import {useDeleteGroupChatMutation, useLeaveGroupMutation} from "../../redux/api/apiSlice.js";
import {userTheme} from "../../constants/userTheme.constant.js";

const DeleteChatMenu = ({dispatch, deleteMenuAnchor}) => {
  const navigate = useNavigate();
  const {isDeleteMenu, selectedDeleteChat} = useSelector(state => state['misc']);

  const [deleteGroupChatHook] = useDeleteGroupChatMutation();
  const [leaveGroupHook] = useLeaveGroupMutation();

  const [deleteChat, _, deleteChatData] = useAsyncMutation(deleteGroupChatHook);
  const [leaveGroup, __, leaveGroupData] = useAsyncMutation(leaveGroupHook);

  const closeHandler = () => dispatch(setIsDeleteMenu(false));

  const leaveGroupHandler = async () => {
    closeHandler();
    await leaveGroup("Leaving Group...", selectedDeleteChat.ChatId);
  };
  const removeFriendHandler = async () => {
    closeHandler();
    await deleteChat("Removing Friend...", selectedDeleteChat.ChatId);
  };

  useEffect(() => {
    if (deleteChatData || leaveGroupData) navigate("/");
  }, [deleteChatData, leaveGroupData]);

  return (
    <Menu
      open={isDeleteMenu}
      onClose={closeHandler}
      anchorEl={deleteMenuAnchor.current}
      anchorOrigin={{
        vertical: "bottom",
        horizontal: "right",
      }}
      transformOrigin={{
        vertical: "center",
        horizontal: "center",
      }}
      sx={{
        "& .MuiMenu-paper": {
          borderRadius: "1.4rem",
          marginTop: "0.35rem",
          background: "linear-gradient(180deg, rgba(16, 27, 44, 0.98) 0%, rgba(10, 18, 30, 0.98) 100%)",
          border: `1px solid ${userTheme.border}`,
          boxShadow: "0 18px 40px rgba(2, 8, 23, 0.38)",
          overflow: "hidden",
        }
      }}
    >
      <Stack
        sx={{
          minWidth: "12.5rem",
          padding: "0.9rem 1rem",
          cursor: "pointer",
          color: userTheme.danger,
          transition: "background-color 0.2s ease, color 0.2s ease",
          "&:hover": {
            backgroundColor: "rgba(251, 113, 133, 0.1)",
            color: "#fecdd3",
          },
        }}
        direction={"row"}
        alignItems={"center"}
        spacing={"0.7rem"}
        onClick={selectedDeleteChat?.groupChat ? leaveGroupHandler : removeFriendHandler}
      >
        {
          selectedDeleteChat?.groupChat
            ? (
              <>
                <LeaveGroupIcon/>
                <Typography sx={{fontWeight: 600}}>Leave Group</Typography>
              </>
            )
            : (
              <>
                <FriendRemoveIcon/>
                <Typography sx={{fontWeight: 600}}>Remove Friend</Typography>
              </>
            )
        }
      </Stack>
    </Menu>
  )
};

export default DeleteChatMenu;
