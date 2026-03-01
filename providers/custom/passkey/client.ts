import { startAuthentication } from "@simplewebauthn/browser";

declare global {
  var __options__: any;
}

document.addEventListener("DOMContentLoaded", async () => {
  // 1. On récupère les options générées par ton Worker et injectées ici
  const options = globalThis.__options__;
  const form = document.getElementById("webauthn-form")! as HTMLFormElement;
  const assertionInput = document.getElementById(
    "assertion-input",
  )! as HTMLInputElement;
  const errorDiv = document.getElementById("error-message")! as HTMLDivElement;

  // L'API est disponible globalement grâce au CDN script plus haut
  try {
    // 2. Déclenche le prompt natif de l'OS (FaceID, Windows Hello...)
    const assertion = await startAuthentication(options);

    // 3. Place la signature cryptographique dans l'input caché
    assertionInput.value = JSON.stringify(assertion);

    // 4. Auto-soumet le formulaire vers ta route de callback (Provider)
    form.submit();
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
      errorDiv.classList.remove("hidden");

      // Gestion propre de l'annulation par l'utilisateur
      if (error.name === "NotAllowedError") {
        errorDiv.innerText =
          "Authentification annulée. Veuillez rafraîchir la page pour réessayer.";
      } else {
        errorDiv.innerText =
          "L'authentification a échoué. Votre appareil n'est peut-être pas compatible.";
      }
    }
  }
});
