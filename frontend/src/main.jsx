const React = window.React;
const ReactDOM = window.ReactDOM;

import App from "./App.jsx";
import appleDesignCss from "./styles/apple.css";


const style = document.createElement("style");
style.dataset.design = "apple";
style.textContent = appleDesignCss;
document.head.appendChild(style);


const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
