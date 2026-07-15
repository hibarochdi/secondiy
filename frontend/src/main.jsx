import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Filet de sécurité : si une erreur inattendue survient n'importe où dans l'app,
// on affiche un message clair et un bouton pour recharger, plutôt qu'une page
// blanche silencieuse sans aucune explication.
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Erreur applicative :", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", padding: "24px", textAlign: "center", fontFamily: "sans-serif" }}>
          <p style={{ fontSize: "18px", fontWeight: 600 }}>Une erreur est survenue.</p>
          <p style={{ fontSize: "14px", color: "#8A6C4E", maxWidth: "360px" }}>
            Désolé, quelque chose s'est mal passé sur cette page. Recharger devrait résoudre le problème.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: "10px 24px", borderRadius: "999px", background: "#5C1626", color: "white", border: "none", cursor: "pointer", fontSize: "14px" }}
          >
            Recharger la page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
