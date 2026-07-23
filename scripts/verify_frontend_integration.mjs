import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const bench = join(root, 'Bench');
const failures = [];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const htmlFiles = walk(bench).filter((path) => path.endsWith('.html'));
for (const file of htmlFiles) {
  const source = readFileSync(file, 'utf8');
  const candidates = [
    ...source.matchAll(/(?:href|src)=["']([^"']+)["']/gi),
    ...source.matchAll(/(?:location\.href|location\.assign|location\.replace)\s*(?:=|\()\s*["']([^"']+)["']/gi),
  ].map((match) => match[1]);
  for (const candidate of candidates) {
    if (!candidate || /^(?:https?:|data:|#|javascript:|\{\{)/i.test(candidate)) continue;
    const clean = candidate.split(/[?#]/)[0];
    if (!clean || !/\.(?:html|js|css)$/i.test(clean)) continue;
    const target = resolve(dirname(file), clean);
    if (!existsSync(target)) failures.push(`${relative(root, file)} -> ${candidate}`);
  }
}

const requiredEntryPages = [
  'onboarding/account.html',
  'onboarding/login.html',
  'onboarding/password-reset.html',
  'onboarding/profile.html',
  'onboarding/agreement.html',
  'onboarding/baseline_assessment.html',
  'onboarding/safety_contact.html',
  'safetyplan/plan.html',
  'daily/emotion-card-main.html',
  'daily/checkin.html',
  'daily/mood-character.html',
  'daily/mood-type.html',
  'daily/hardness-check.html',
  'daily/journal.html',
  'daily/ai-comment.html',
];

for (const page of requiredEntryPages) {
  const source = readFileSync(join(bench, page), 'utf8');
  if (!source.includes('js/entry.js')) failures.push(`${page} is missing js/entry.js`);
}

const profilePage = readFileSync(join(bench, 'onboarding/profile.html'), 'utf8');
if (profilePage.indexOf('js/entry.js') < profilePage.lastIndexOf('</x-dc>')) {
  failures.push('onboarding/profile.html must load entry.js outside the replaceable x-dc root');
}
if (!profilePage.includes("const dropdownSelector = '.birth-group, .region-group, .education-group'")) {
  failures.push('onboarding/profile.html is missing persistent dropdown event delegation');
}
const entry = readFileSync(join(bench, 'js/entry.js'), 'utf8');
if (!entry.includes('const bootWhenRendered = () =>')) {
  failures.push('entry.js must wait for the design-component root before binding page events');
}
const onboardingPageLogic = readFileSync(join(bench, 'js/pages/onboarding.js'), 'utf8');
const agreementPage = readFileSync(join(bench, 'onboarding/agreement.html'), 'utf8');

const onboardingSequence = [
  ['welcome.html', './account.html'],
  ['profile.html', './agreement.html'],
  ['agreement.html', './safety_contact.html'],
  ['safety_contact.html', './alert.html'],
  ['alert.html', './landing.html'],
];
for (const [page, destination] of onboardingSequence) {
  const source = readFileSync(join(bench, 'onboarding', page), 'utf8');
  if (!source.includes(destination)) failures.push(`onboarding/${page} must continue to ${destination}`);
}
if (!onboardingPageLogic.includes("location.href = './safety_contact.html'")) {
  failures.push('agreement API completion must continue directly to safety_contact');
}
if (!onboardingPageLogic.includes('withmindAgreementBound') || !onboardingPageLogic.includes("item.setAttribute('aria-pressed'")) {
  failures.push('agreement checkboxes must bind after the design component is rendered');
}
if (!agreementPage.includes('entry.js?v=20260720-agreement-check') || !entry.includes('onboarding.js?v=20260720-agreement-check')) {
  failures.push('agreement checkbox scripts must bypass stale browser caches');
}
if (!onboardingPageLogic.includes("location.href = './profile.html'")) {
  failures.push('successful account signup must continue directly to profile');
}
if (onboardingPageLogic.includes('resume=profile')) {
  failures.push('account signup must not redirect existing-email errors to login');
}

const runtime = readFileSync(join(bench, 'runtime-config.js'), 'utf8');
if (!runtime.includes("functionsUrl: '/api'")) failures.push('runtime-config.js must target the authenticated Vercel API proxy');

const daily = readFileSync(join(bench, 'js/pages/daily.js'), 'utf8');
const userGreeting = readFileSync(join(bench, 'js/user-greeting.js'), 'utf8');
for (const workflow of ['ema-interpret', 'ema-reflection-question', 'emi-generate-questions', 'emi-comment']) {
  if (!daily.includes(`'${workflow}'`)) failures.push(`daily.js does not invoke ${workflow}`);
}
const emiCommentFunction = readFileSync(join(root, 'supabase/functions/emi-comment/index.ts'), 'utf8');
for (const input of ['selected_question_1', 'selected_question_2', 'combined_response']) {
  if (!emiCommentFunction.includes(input)) failures.push(`emi-comment prompt is missing the journal input ${input}`);
}
for (const marker of ['validatePersonalizedComment', 'GENERIC_COMMENT_PHRASES', 'OpenAI returned a generic EMI comment; no result was saved']) {
  if (!emiCommentFunction.includes(marker)) failures.push(`emi-comment generic response guard is missing ${marker}`);
}

const appApi = readFileSync(join(root, 'supabase/functions/app-api/index.ts'), 'utf8');
for (const action of ['accept_consent', 'submit_baseline_values', 'get_safety_plan', 'save_safety_plan', 'start_ema', 'save_ema_answers']) {
  if (!appApi.includes(`case '${action}'`)) failures.push(`app-api is missing ${action}`);
}

const moodCharacter = readFileSync(join(bench, 'daily/mood-character.html'), 'utf8');
const moodTypePage = readFileSync(join(bench, 'daily/mood-type.html'), 'utf8');
const journalPage = readFileSync(join(bench, 'daily/journal.html'), 'utf8');
const checkinPage = readFileSync(join(bench, 'daily/checkin.html'), 'utf8');
const aiCommentPage = readFileSync(join(bench, 'daily/ai-comment.html'), 'utf8');
const personalizedGreetingPages = [
  ['home', readFileSync(join(bench, 'home/home.html'), 'utf8')],
  ['onboarding-home', readFileSync(join(bench, 'onboarding/home.html'), 'utf8')],
  ['checkin', checkinPage],
  ['ai-comment', aiCommentPage],
  ['crisis', readFileSync(join(bench, 'safetyplan/crisis.html'), 'utf8')],
];
for (const [page, source] of personalizedGreetingPages) {
  if (!source.includes('data-user-vocative')) failures.push(`${page} must expose the personalized nickname greeting`);
  if (!source.includes('entry.js?v=20260723-user-greeting')) failures.push(`${page} must load the current nickname greeting logic`);
  if (/지우[야아]/.test(source)) failures.push(`${page} must not contain a fixed Jiwoo greeting`);
}
for (const marker of ['getOnboardingStatus', 'profile?.nickname', '0xAC00', "% 28 !== 0", "return `${nickname} 친구야`"]) {
  if (!userGreeting.includes(marker)) failures.push(`nickname greeting logic is missing ${marker}`);
}
if (!entry.includes('bindUserGreeting(document)')) failures.push('entry.js must bind personalized nickname greetings');
if (moodCharacter.includes('오늘은 마음이 비교적 편안했구나.')) {
  failures.push('mood-character.html must not contain a fixed AI comment');
}
if (!moodCharacter.includes('data-ai-comment-state="loading"')) {
  failures.push('mood-character.html must expose the AI comment loading state');
}
if (!aiCommentPage.includes('data-ai-comment-state="loading"') || aiCommentPage.includes('data-fallback-text=')) {
  failures.push('ai-comment.html must load the current comment without a fixed fallback');
}
if (!moodCharacter.includes('id="characterDescription"')) {
  failures.push('mood-character.html must expose the dynamic character description');
}
if (!moodTypePage.includes('id="moodCharacterDescription"')) {
  failures.push('mood-type.html must expose the dynamic character description');
}
for (const imageName of ['character_sun_pebble_1024.png', 'character_cloud_cushion_1024.png', 'character_water_pot_1024.png', 'character_radio_1024.png', 'character_tense_balloon_1024.png', 'character_tangled_earphones_1024.png']) {
  if (!daily.includes(imageName)) failures.push(`daily.js is missing the local character image mapping for ${imageName}`);
}
for (const marker of ['CHARACTER_DESCRIPTIONS', 'characterDescription', '하나씩 천천히 풀어가는 캐릭터예요.']) {
  if (!daily.includes(marker)) failures.push(`mood-character description mapping is missing ${marker}`);
}
for (const marker of ['renderCharacterPresentation', "descriptionSelector: '#moodCharacterDescription'", "imageSelector: '.character-card img'"]) {
  if (!daily.includes(marker)) failures.push(`mood-type character synchronization is missing ${marker}`);
}
for (const marker of ['generatedComment', 'aiComment: { flowId', 'flow: flowId', 'hasCurrentCachedComment', 'rowFlowId !== flowId']) {
  if (!daily.includes(marker)) failures.push(`ai-comment flow pinning is missing ${marker}`);
}
for (const marker of ['ensureEmiQuestionsReady', 'hasStoredEmiQuestions', 'questions_generated_at', '질문 확인 중...']) {
  if (!daily.includes(marker)) failures.push(`EMI question readiness guard is missing ${marker}`);
}
if (readFileSync(join(bench, 'daily/hardness-check.html'), 'utf8').includes("location.href = './journal.html'")) {
  failures.push('hardness-check inline script must not bypass persisted EMI question generation');
}
if (journalPage.includes("location.href = './ai-comment.html'")) {
  failures.push('journal inline script must not bypass the database-backed submit flow');
}
if (!entry.includes('daily.js?v=20260723-emi-questions-ready')) {
  failures.push('daily page logic must bypass stale browser caches');
}
for (const [page, source, version] of [
  ['mood-character', moodCharacter, '20260722-ai-comment-flow'],
  ['mood-type', moodTypePage, '20260722-ai-comment-flow'],
  ['journal', journalPage, '20260723-emi-questions-ready'],
  ['ai-comment', aiCommentPage, '20260723-user-greeting'],
]) {
  if (!source.includes(`entry.js?v=${version}`)) failures.push(`${page} must load the current daily page logic`);
}
for (const marker of ['rememberJournalAnswer', 'journalAnswerFromEmi', 'journalAnswerFromLocation', 'renderJournalAnswer', 'getEmi({ flowId })']) {
  if (!daily.includes(marker)) failures.push(`journal-to-comment synchronization is missing ${marker}`);
}
if (!daily.includes("getEmaResult(flowId ? { flowId } : {})")) {
  failures.push('mood-character must fall back to the latest stored EMA AI result');
}

const vercelAppApi = readFileSync(join(root, 'api/app-api.js'), 'utf8');
if (!vercelAppApi.includes("if (action === 'get_safety_plan')")) failures.push('Vercel app-api is missing get_safety_plan');
if (!vercelAppApi.includes("{ upsert: true, onConflict: 'user_id' }")) failures.push('Vercel app-api must upsert safety plans by user_id');
if (!vercelAppApi.includes('isMissingExtendedProfileColumns')) failures.push('Vercel app-api must support the deployed legacy profile schema');
if (!vercelAppApi.includes('p_region_name: regionName') || !vercelAppApi.includes("result = await rpc(env, 'complete_registration', legacy)")) {
  failures.push('Vercel app-api must support both deployed legacy registration RPC signatures');
}

const authSignup = readFileSync(join(root, 'api/auth-signup.js'), 'utf8');
if (authSignup.includes("Number(error?.status) === 422")) failures.push('auth-signup must not report every validation error as an existing email');

const safetyPlanPage = readFileSync(join(bench, 'safetyplan/plan.html'), 'utf8');
for (const field of ['warningSigns', 'calmingMethods', 'contactText']) {
  if (!safetyPlanPage.includes(`data-safety-value="${field}"`)) failures.push(`safetyplan/plan.html is missing ${field}`);
}
if (!onboardingPageLogic.includes('if (!session?.access_token)')) {
  failures.push('safety_contact must preserve local safety-plan edits without an auth session');
}
if (!onboardingPageLogic.includes("profile?.registration_status === 'completed'")) {
  failures.push('login must resume onboarding when the authenticated profile is incomplete');
}
if (!onboardingPageLogic.includes('getOnboardingStatus')) {
  failures.push('onboarding must load the authenticated profile status');
}
if (!daily.includes('/active completed user profile is required/i')) {
  failures.push('daily EMA pages must recover incomplete authenticated profiles');
}

for (const name of ['ema-interpret', 'ema-reflection-question', 'emi-generate-questions', 'emi-comment']) {
  const source = readFileSync(join(root, `supabase/functions/${name}/index.ts`), 'utf8');
  if (!source.includes('assertFlowOwner')) failures.push(`${name} is missing ownership validation`);
}

for (const name of ['ema-interpret', 'ema-reflection-question', 'emi-generate-questions', 'emi-comment']) {
  if (!existsSync(join(root, `api/${name}.js`))) failures.push(`Vercel API proxy is missing ${name}`);
}

if (!existsSync(join(root, 'api/auth-signup.js'))) failures.push('Vercel API proxy is missing auth-signup');
const supabaseClient = readFileSync(join(bench, 'js/supabase-client.js'), 'utf8');
if (!supabaseClient.includes("resolveUrl(config.functionsUrl, 'auth-signup')")) {
  failures.push('supabase-client.js must use the server-side auth-signup endpoint');
}
if (!supabaseClient.includes("recover?redirect_to=${encodeURIComponent(redirectTo)}")) {
  failures.push('supabase-client.js must support password recovery email redirects');
}
if (!supabaseClient.includes("fetch(`${config.authUrl}/user`")) {
  failures.push('supabase-client.js must support updating a recovered password');
}
const loginPage = readFileSync(join(bench, 'onboarding/login.html'), 'utf8');
if (!loginPage.includes('href="./password-reset.html"')) {
  failures.push('onboarding/login.html must link to password recovery');
}

if (failures.length) {
  console.error('Frontend integration verification failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Frontend integration verification passed (${htmlFiles.length} HTML files checked).`);
