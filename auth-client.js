/**
 * GhostReply - Auth Client
 * Wrapper fino sobre chrome.runtime.sendMessage para falar com background.js.
 * content.js nunca lida com mensageria bruta, só chama os métodos abaixo.
 */

const authSendMessage = (type, payload) => GhostReplyMessaging.send(type, payload);
const AuthClient = {
  getCapabilities: () => authSendMessage('AUTH_CAPABILITIES'),
  getSession: () => authSendMessage('AUTH_GET_SESSION'),
  signup: (name, email, password) => authSendMessage('AUTH_SIGNUP', { name, email, password }),
  login: (email, password, remember) => authSendMessage('AUTH_LOGIN', { email, password, remember }),
  logout: () => authSendMessage('AUTH_LOGOUT'),
  loginWithGoogle: () => authSendMessage('AUTH_GOOGLE'),
  recoverPassword: (email) => authSendMessage('AUTH_RECOVER', { email }),
  updatePassword: (currentPassword, newPassword) =>
    authSendMessage('AUTH_UPDATE_PASSWORD', { currentPassword, newPassword }),
  updateProfile: (name) => authSendMessage('AUTH_UPDATE_PROFILE', { name })
};
