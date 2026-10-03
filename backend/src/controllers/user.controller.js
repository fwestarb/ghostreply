const asyncHandler = require('../utils/asyncHandler');
const userService = require('../services/user.service');

const getMe = asyncHandler(async (req, res) => {
  const user = await userService.getProfile(req.user.id);
  res.status(200).json({ user });
});

const updateMe = asyncHandler(async (req, res) => {
  const user = await userService.updateProfile(req.user.id, req.body);
  res.status(200).json({ user });
});

const changePassword = asyncHandler(async (req, res) => {
  await userService.changePassword(req.user.id, req.body);
  res.status(200).json({ message: 'Senha alterada com sucesso.' });
});

module.exports = { getMe, updateMe, changePassword };
