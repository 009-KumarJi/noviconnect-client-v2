import {createAsyncThunk} from "@reduxjs/toolkit";
import {server} from "../../constants/config.constant.js";
import axios from "axios";

const getRequestErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (axios.isAxiosError(error)) {
    const responseMessage = typeof error.response?.data?.message === "string"
      ? error.response.data.message
      : "";

    if (responseMessage) return responseMessage;

    if (error.code === "ERR_NETWORK") {
      return "Unable to reach the admin server. Check backend availability and CORS allowlist settings.";
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
};

const adminLogin = createAsyncThunk("admin/login", async (secretKey) => {
  try {
    const config = {
      withCredentials: true,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const {data} = await axios.post(
      `${server}/admin/api/krishna-den/verify`,
      {secret_key: secretKey},
      config
    );

    return data.message;
  } catch (error: unknown) {
    throw new Error(getRequestErrorMessage(error, "Admin login failed."));
  }
});

const adminLogout = createAsyncThunk("admin/logout", async () => {
  try {
    const config = {
      withCredentials: true,
      headers: {
        "Content-Type": "application/json",
      },
    };
    const {data} = await axios.get(`${server}/admin/api/krishna-den/logout`, config);
    return data.message;
  } catch (error: unknown) {
    throw new Error(getRequestErrorMessage(error, "Admin logout failed."));
  }
});

const verifyAdmin = createAsyncThunk("admin/verify", async () => {
  try {
    const {data} = await axios.get(`${server}/admin/api/krishna-den/`, {withCredentials: true});
    return data;
  } catch (error: unknown) {
    throw new Error(getRequestErrorMessage(error, "Unable to verify admin session."));
  }
});

export {adminLogin, adminLogout, verifyAdmin};
