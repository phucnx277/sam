import { useState, type FormEvent } from "react";
import useLocalPlayer from "@hooks/useLocalPlayer";
import { newPlayer } from "@logic/player";

const InputPlayerInfo = () => {
  const { setLocalPlayer } = useLocalPlayer();
  const [name, setName] = useState("");

  const savePlayer = (e: FormEvent) => {
    e.preventDefault();
    if (!name) return;
    if (name.trim().startsWith("@")) {
      return alert("Name is invalid");
    }
    setLocalPlayer(newPlayer(name));
  };

  return (
    <form
      className="w-full flex flex-col items-center justify-center"
      onSubmit={savePlayer}
      autoComplete="off"
    >
      <div className="text-xl">Enter your name</div>
      <input
        name="uname"
        className="mt-4 py-1 px-2 border border-gray-500 rounded-sm text-lg w-[250px] max-w-full"
        autoFocus
        placeholder="Input your name"
        type="text"
        value={name}
        onInput={(e) => setName(e.currentTarget.value)}
      />
      <button type="submit" className={`mt-4 bg-green-600`} disabled={!name}>
        Next
      </button>
    </form>
  );
};

export default InputPlayerInfo;
