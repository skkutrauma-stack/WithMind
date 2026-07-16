const { proxyLlm } = require('./_lib/supabase');
module.exports = (req, res) => proxyLlm(req, res, 'ema', 'ema-interpret');
