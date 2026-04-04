import React, {memo} from 'react';
import {Box, Typography} from "@mui/material";
import moment from "../../lib/dayjs.js";
import {fileFormat} from "../../lib/features.js";
import RenderAttachment from "./RenderAttachment.jsx";
import {sout} from "../../utils/helper.js";
import {motion} from "framer-motion";
import {userTheme} from "../../constants/userTheme.constant.js";

const MessageComponent = ({message, loggedUser}) => {
  sout(`(sent by ${loggedUser.name})MessageComponent: `, message)
  const {sender, content, attachments = [], createdAt} = message;
  const isSameSender = sender?._id === loggedUser?._id;
  const timeAgo = moment(createdAt).fromNow();
  return (
    <motion.div
      initial={{opacity: 0, x: "-100%"}}
      whileInView={{opacity: 1, x: 0}}

      style={{
        alignSelf: isSameSender ? "flex-end" : "flex-start",
        background: isSameSender
          ? "linear-gradient(135deg, rgba(56, 189, 248, 0.2) 0%, rgba(94, 234, 212, 0.14) 100%)"
          : "rgba(10, 19, 32, 0.9)",
        color: userTheme.text,
        borderRadius: "1rem",
        padding: "0.75rem 0.9rem",
        width: "fit-content",
        maxWidth: "min(34rem, 80%)",
        border: `1px solid ${isSameSender ? userTheme.borderStrong : userTheme.border}`,
        boxShadow: "0 10px 30px rgba(2, 8, 23, 0.18)",
      }}
    >
      {!isSameSender && (
        <Typography fontWeight={700} variant="caption" sx={{color: userTheme.accentBlue, display: "block", mb: 0.3}}>{sender.name}</Typography>)}
      {content && (<Typography sx={{whiteSpace: "pre-wrap"}}>{content}</Typography>)}
      {
        attachments.length > 0 && (
          attachments.map((attachment, index) => {
            const url = attachment.url;
            const file = fileFormat(url);
            return (
              <Box key={index} mt={0.8}>
                <a href={url} target="_blank" download={true} style={{color: userTheme.accent}}>
                  {RenderAttachment(file, url)}
                </a>
              </Box>
            )
          }))
      }
      <Typography variant={"caption"} sx={{color: userTheme.textMuted, display: "block", mt: 0.5}}>{timeAgo}</Typography>
    </motion.div>
  );
};

export default memo(MessageComponent);
