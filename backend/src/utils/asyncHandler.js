// Evita repetir try/catch em cada controller: encaminha qualquer rejeição
// da Promise para o middleware global de erros via next(err).
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
