const { proxyLlm } = require('./_lib/supabase');
module.exports = (req, res) => proxyLlm(req, res, 'emi', 'emi-generate-questions');
