import React from 'react';
import {Helmet} from "react-helmet-async"; // Helmet is a library that allows you to manage the document head of your application.
import {useLocation} from "react-router-dom";

const Title = ({
                 title,
                 description = "Name of this chatting app is NoviConnect."
               }) => {
  const {pathname} = useLocation();

  const routeTitles = [
    {match: /^\/$/, title: "NoviConnect"},
    {match: /^\/chat\/[^/]+$/, title: "Chat | NoviConnect"},
    {match: /^\/groups$/, title: "Groups | NoviConnect"},
    {match: /^\/settings$/, title: "Settings | NoviConnect"},
    {match: /^\/login$/, title: "Login | NoviConnect"},
    {match: /^\/register$/, title: "Sign Up | NoviConnect"},
    {match: /^\/forgot-password$/, title: "Forgot Password | NoviConnect"},
    {match: /^\/krishnaden$/, title: "KrishnaDen Login | NoviConnect"},
    {match: /^\/krishnaden\/dashboard$/, title: "KrishnaDen Dashboard | NoviConnect"},
    {match: /^\/krishnaden\/user-management$/, title: "User Management | KrishnaDen"},
    {match: /^\/krishnaden\/chat-management$/, title: "Chat Management | KrishnaDen"},
  ];

  const resolvedTitle = title || routeTitles.find((route) => route.match.test(pathname))?.title || "NoviConnect";

  return (
    <Helmet>
      <title>{resolvedTitle}</title>
      <meta name={"description"} content={description}/>
    </Helmet>
  );
};

export default Title;
