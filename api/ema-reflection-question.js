const { proxyLlm } = require('./_lib/supabase');
module.exports = (req, res) => proxyLlm(req, res, 'ema_reflection', 'ema-reflection-question');
