import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";

createRoot(document.getElementById("root")!).render(<App />);
