import { useNavigate } from "react-router-dom";
import { Logo } from "../../svgs/logoSVG";
import styles from "./message.module.css";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import axios from "axios";
import Markdown from "react-markdown";
import LoginContext from "../../context/context";
import { LuLogIn, LuLogOut } from "react-icons/lu";

function Chat({ text, own, isLoading = false }) {
  return (
    <div className={`${styles.chat} ${own && styles.own}`}>
      <Markdown>{text}</Markdown>
      {isLoading && <div className={styles.loadCursor}></div>}
    </div>
  );
}

function LoaderRipple() {
  return (
    <div className={styles["lds-ripple"]}>
      <div></div>
      <div></div>
    </div>
  );
}

function Message() {
  const [chatId, setChatId] = useState(null);
  const navigate = useNavigate();
  const { logout, loggedIn } = useContext(LoginContext);
  const mainRef = useRef();
  const [chat, setChat] = useState([]);
  const [chatState, setChatState] = useState("busy");
  const [chatInit, setChatInit] = useState(false);
  const [message, setMessage] = useState("");
  const ws = useRef(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (mainRef.current) {
      const container = mainRef.current;
      container.scrollTop = container.scrollHeight;
    }
  }, [chat]);

  useEffect(() => {
    async function fetchData() {
      try {
        const { data } = await axios.get(process.env.REACT_APP_API_LINK + "/chat", {
          withCredentials: true,
        });
        setChatId(data.chatId);
        console.log(data);
      } catch (error) {
        console.log("Error Fetching Data:", error);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (chatId !== null) {
      const wss = new WebSocket(`ws://localhost:8802?id=${chatId}`);
      ws.current = wss;
  
      wss.addEventListener("open", () => {
        console.log("WebSocket connected");
        ws.current.send(JSON.stringify({ type: "client:connected" }));
        ws.current.send(JSON.stringify({ type: "client:chathist" }));
      });
  
      wss.addEventListener("message", (event) => {
        const data = JSON.parse(event.data);
        console.log("WebSocket message received:", data);
  
        if (data?.type === "server:chathist") {
          const histdata = data?.data;
          if (!histdata) return;
  
          const newChat = histdata.flatMap((conv) => [
            { message: conv.prompt, own: true },
            { message: conv.response, own: false }
          ]);
  
          setChat(newChat);
          setChatState("idle");
          setChatInit(true);
        } else if (data?.type === "server:response:chunk") {
          setChat((prevchat) => [
            ...prevchat.slice(0, -1),
            {
              message: `${prevchat.at(-1).message}${data.chunk}`,
              own: false,
              isLoading: true,
            },
          ]);
        } else if (data?.type === "server:response:end") {
          setChat((prevchat) => [
            ...prevchat.slice(0, -1),
            {
              message: prevchat.at(-1).message,
              own: false,
              isLoading: false,
            },
          ]);
          setChatState("idle");
        }
      });
  
      wss.addEventListener("close", () => {
        console.log("WebSocket closed");
      });
  
      wss.addEventListener("error", (error) => {
        console.error("WebSocket Error:", error);
      });
  
      return () => {
        wss.close();
      };
    }
  }, [chatId]);

  const handleClick = () => {
    setChat((prevchat) => [...prevchat, { message, own: true }]);
    console.log("Message sent:", message);
    ws.current?.send(
      JSON.stringify({
        type: "client:prompt",
        prompt: message,
      })
    );
    setMessage("");
    setChatState("busy");
    setChat((prevchat) => [
      ...prevchat,
      { message: "", own: false, isLoading: true },
    ]);
  };

  const logoutUser = async () => {
    try {
      const { data } = await axios.get(process.env.REACT_APP_API_LINK + "/logout", {
        withCredentials: true,
      });
      console.log(data);
      if (data?.msg === "loggedout") {
        logout();
      }
    } catch (error) {
      console.log("Error in logout:", error);
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      try {
        await axios.get(process.env.REACT_APP_API_LINK + "/check-session", {
          withCredentials: true,
        });
      } catch (error) {
        // If session expired, set sessionExpired to true
        setSessionExpired(true);
        // Redirect to login page
        navigate("/login");
      }
    };

    // Check session every 5 minutes
    const interval = setInterval(checkSession, 300000);

    return () => clearInterval(interval);
    checkSession();
  }, []);

  if (sessionExpired) {
    return <div>Session expired. Redirecting to login...</div>;
  }

  return (
    <div className={styles.messageContainer}>
      <header>
        <div className={styles.logoContainer} onClick={() => navigate('/')}>
          <Logo />
          <div className={styles.headerText}>
            <h4>MindMate</h4>
            <h6>A mental health chat assistance</h6>
          </div>
        </div>
        <div className="flex flex-row gap-4">
          <button
            onClick={() => {
              if (!loggedIn) navigate("/login");
              else navigate("/analysis");
            }}
          >
            Analyse
          </button>
          <button
            onClick={() => {
              if (!loggedIn) navigate("/login");
              else logoutUser();
            }}
          >
            {!loggedIn ? <LuLogIn /> : <LuLogOut />}
          </button>
        </div>
      </header>
      <main
        ref={mainRef}
        style={
          !chatInit || chat.length === 0
            ? { display: "flex", alignItems: "center", justifyContent: "center" }
            : {}
        }
      >
        {!chatInit && (
          <div className={styles.loadingChatInit}>
            <LoaderRipple />
          </div>
        )}
        {chatInit && chat.length === 0 && (
          <div className={styles.emptyChat}>
            No Previous Chat History!
            <br />
            Chat with me now.
          </div>
        )}
        {chatInit &&
          chat.map((x, i) => (
            <Chat
              text={x.message}
              own={x.own}
              key={i}
              isLoading={x.isLoading}
            />
          ))}
      </main>
      <footer>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleClick();
          }}
        >
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button
            type="submit"
            disabled={chatState === "busy"}
          >
            <span className="material-symbols-outlined">send</span>
          </button>
        </form>
      </footer>
    </div>
  );
}

export default Message;
