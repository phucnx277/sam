import { Analytics } from "@vercel/analytics/react";
import "./App.css";
import Lobby from "./components/Lobby/Lobby";

function App() {
  return (
    <div className="h-full w-full p-2 bg-cyan-50">
      <Lobby />
      <Analytics />
    </div>
  );
}

export default App;
