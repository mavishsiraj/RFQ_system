import { useEffect, useState } from "react";

export default function Countdown({ target }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    function calc() {
      const diff = new Date(target).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Ended");
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(
        `${h > 0 ? `${h}h ` : ""}${m}m ${s}s`
      );
    }

    calc();
    const timer = setInterval(calc, 1000);
    return () => clearInterval(timer);
  }, [target]);

  const diff = new Date(target).getTime() - Date.now();
  const urgent = diff > 0 && diff < 600000; 

  return (
    <span className={urgent ? "text-red-600 font-semibold" : ""}>
      {remaining}
    </span>
  );
}
