import React from "react";
import Home from "./pages/Home";
import Admin from "./pages/Admin";

export default function App() {
  const path = window.location.pathname;
  if (path.startsWith("/admin")) return <Admin />;
  return <Home />;
}