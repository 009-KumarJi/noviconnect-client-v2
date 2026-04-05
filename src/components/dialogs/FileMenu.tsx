import React, {useRef} from 'react';
import {Box, ListItemText, Menu, MenuItem, MenuList} from "@mui/material";
import {useDispatch, useSelector} from "react-redux";
import {setIsFileMenu, setUploadingLoader} from "../../redux/reducers/miscSlice.js";
import {
  AudioFile as AudioIcon,
  Image as ImageIcon,
  InsertDriveFile as DocumentIcon,
  MovieFilter as VideoIcon
} from "@mui/icons-material";
import {paleBlueOpaque} from "../../constants/color.constant.js";
import toast from "react-hot-toast";
import {useSendAttachmentsMutation} from "../../redux/api/apiSlice.js";
import {useChatDetailsQuery} from "../../redux/api/apiSlice.js";
import {encryptAttachmentsForUpload} from "../../lib/e2ee";
import {isE2EEEnabled} from "../../constants/config.constant.js";

const FileMenu = ({anchorE1, ChatId}) => {

  const imageRef = useRef(null);
  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const documentRef = useRef(null);

  const {isFileMenu} = useSelector(state => state['misc']);
  const dispatch = useDispatch();
  const [sendAttachments] = useSendAttachmentsMutation();
  const chatDetails = useChatDetailsQuery({ChatId, populate: true}, {skip: !ChatId});
  const members = chatDetails?.data?.chat?.members || [];
  const selectRef = (ref) => ref.current?.click();
  const handleClose = () => dispatch(setIsFileMenu(false));
  const getUploadErrorMessage = (error) =>
    error?.data?.message ||
    error?.error ||
    error?.message ||
    "Unable to send attachments right now.";

  const handleFileOpen = async (e, key) => {
    const input = e.target;
    const files = Array.from(input.files || []);

    if (files.length <= 0) return;
    if (files.length > 5) {
      input.value = "";
      return toast.error(`You can upload at most 5 ${key} at a time!`);
    }
    if (!ChatId) {
      input.value = "";
      return toast.error("Open a chat before sending attachments.");
    }
    if (isE2EEEnabled && !members.length) {
      input.value = "";
      return toast.error("Secure chat members are still loading. Please try again in a moment.");
    }
    if (isE2EEEnabled && members.some((member) => !member?.encryptionPublicKey)) {
      input.value = "";
      return toast.error("One or more chat members have not finished secure-message setup yet.");
    }

    dispatch(setUploadingLoader(true));
    const label = files.length === 1 ? key.slice(0, key.length - 1) : key;
    const toastId = toast.loading(`Uploading ${files.length} ${label}...`);

    try {
      const formData = new FormData();
      formData.append("ChatId", ChatId);

      if (isE2EEEnabled) {
        const encryptedFiles = await encryptAttachmentsForUpload({files, members});
        encryptedFiles.forEach(({file}) => formData.append("files", file));
        formData.append("attachmentMetadata", JSON.stringify(encryptedFiles.map(({metadata}) => metadata)));
      } else {
        files.forEach((file) => formData.append("files", file));
      }

      await sendAttachments(formData).unwrap();
      toast.success(`${label} sent successfully!`, {id: toastId});
    } catch (error) {
      toast.error(getUploadErrorMessage(error), {id: toastId});
    } finally {
      input.value = "";
      dispatch(setUploadingLoader(false));
      dispatch(setIsFileMenu(false));
    }
  };

  return (
    <Menu open={isFileMenu} anchorEl={anchorE1} onClose={handleClose}>
      <Box sx={{
        width: "10rem"
      }}>
        <MenuList>
          <MenuItem onClick={() => selectRef(imageRef)}>
            <ImageIcon sx={{
              color: paleBlueOpaque,
              fontSize: "1.5rem"
            }}/>
            <ListItemText primary={"Image"} sx={{marginLeft: "1rem"}}/>
            <input
              type="file"
              multiple
              accept="image/png, image/jpeg, image/jpg, image/gif, image/svg, image/webp"
              style={{display: 'none'}}
              onChange={(e) => handleFileOpen(e, "images")}
              ref={imageRef}
            />
          </MenuItem>
          <MenuItem onClick={() => selectRef(audioRef)}>
            <AudioIcon sx={{
              color: paleBlueOpaque,
              fontSize: "1.5rem"
            }}/>
            <ListItemText primary={"Audio"} sx={{marginLeft: "1rem"}}/>
            <input
              type="file"
              multiple
              accept="audio/mpeg, audio/wav, audio/ogg, audio/midi, audio/aac"
              style={{display: 'none'}}
              onChange={(e) => handleFileOpen(e, "audios")}
              ref={audioRef}
            />
          </MenuItem>
          <MenuItem onClick={() => selectRef(videoRef)}>
            <VideoIcon sx={{
              color: paleBlueOpaque,
              fontSize: "1.5rem"
            }}/>
            <ListItemText primary={"Video"} sx={{marginLeft: "1rem"}}/>
            <input
              type="file"
              multiple
              accept="video/mp4, video/webm, video/ogg, video/quicktime"
              style={{display: 'none'}}
              onChange={(e) => handleFileOpen(e, "videos")}
              ref={videoRef}
            />
          </MenuItem>
          <MenuItem onClick={() => selectRef(documentRef)}>
            <DocumentIcon sx={{
              color: paleBlueOpaque,
              fontSize: "1.5rem"
            }}/>
            <ListItemText primary={"Document"} sx={{marginLeft: "1rem"}}/>
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
              style={{display: 'none'}}
              onChange={(e) => handleFileOpen(e, "documents")}
              ref={documentRef}
            />
          </MenuItem>
        </MenuList>
      </Box>
    </Menu>
  );
};

export default FileMenu;
