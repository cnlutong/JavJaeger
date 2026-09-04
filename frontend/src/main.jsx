const React = window.React;
const ReactDOM = window.ReactDOM;

import App from "./App.jsx";
import "./nocturne.css";
import { applyAppTheme, loadAppTheme } from "./utils/theme.js";


applyAppTheme(loadAppTheme());
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
