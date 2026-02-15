#!/usr/bin/env bun
import * as p from '@clack/prompts';
import pc from 'picocolors';

type CommitType =
	| 'feat'
	| 'fix'
	| 'docs'
	| 'style'
	| 'refactor'
	| 'perf'
	| 'test'
	| 'build'
	| 'ci'
	| 'chore'
	| 'revert';

const TYPES: { value: CommitType; label: string; hint: string }[] = [
	{ value: 'feat', label: 'feat', hint: 'New feature' },
	{ value: 'fix', label: 'fix', hint: 'Bug fix' },
	{ value: 'docs', label: 'docs', hint: 'Documentation only' },
	{ value: 'style', label: 'style', hint: 'Formatting (no logic change)' },
	{ value: 'refactor', label: 'refactor', hint: 'Refactor (no feature/bugfix)' },
	{ value: 'perf', label: 'perf', hint: 'Performance improvement' },
	{ value: 'test', label: 'test', hint: 'Add/update tests' },
	{ value: 'build', label: 'build', hint: 'Build system/dependencies' },
	{ value: 'ci', label: 'ci', hint: 'CI config/scripts' },
	{ value: 'chore', label: 'chore', hint: 'Maintenance tasks' },
	{ value: 'revert', label: 'revert', hint: 'Revert a commit' }
];

const SCOPE_SUGGESTIONS = [
	'(none)',
	'api',
	'auth',
	'db',
	'prisma',
	'user',
	'logger',
	'config',
	'core',
	'infra',
	'docs'
];

function isCancel(x: unknown) {
	return p.isCancel(x);
}

function sanitizeSubject(subject: string) {
	// Conventional Commits: concise, no trailing period
	let s = subject.trim();
	s = s.replace(/\s+/g, ' ');
	s = s.replace(/\.$/, '');
	// optional: lowercase first letter (feel free to remove)
	s = s.charAt(0).toLowerCase() + s.slice(1);
	return s;
}

function buildHeader(type: CommitType, scope: string | null, breaking: boolean, subject: string) {
	const scopePart = scope ? `(${scope})` : '';
	const breakingPart = breaking ? '!' : '';
	return `${type}${scopePart}${breakingPart}: ${subject}`;
}

async function runOrExit(label: string, cmd: string[]) {
	p.log.step(`${pc.cyan('▶')} ${label}`);
	const proc = Bun.spawn(cmd, { stdout: 'inherit', stderr: 'inherit', stdin: 'inherit' });
	const code = await proc.exited;
	if (code !== 0) {
		p.log.error(`${pc.red('✖')} ${label} failed`);
		process.exit(code);
	}
	p.log.success(`${pc.green('✔')} ${label} passed`);
}

async function run(cmd: string[], opts?: { silent?: boolean }) {
	const proc = Bun.spawn(cmd, {
		stdout: opts?.silent ? 'ignore' : 'inherit',
		stderr: 'inherit',
		stdin: 'inherit'
	});
	const code = await proc.exited;
	if (code !== 0) process.exit(code);
}

async function getChangedSummary(): Promise<string> {
	const proc = Bun.spawn(['git', 'status', '--porcelain'], {
		stdout: 'pipe',
		stderr: 'pipe'
	});
	const out = await new Response(proc.stdout).text();
	const code = await proc.exited;
	if (code !== 0) return '';

	const lines = out.trim().split('\n').filter(Boolean);
	if (!lines.length) return '';
	return lines
		.slice(0, 10)
		.map((l) => `- ${l}`)
		.join('\n');
}

p.intro(pc.cyan('Commit wizard (Conventional Commits)'));

const runChecksFirst = await p.confirm({
	message: 'Run checks first? (recommended)',
	initialValue: true
});
if (isCancel(runChecksFirst)) {
	p.cancel('Cancelled.');
	process.exit(0);
}

if (runChecksFirst) {
	// Optional: auto-format first (so lint passes more often)
	const runFormatFirst = await p.confirm({
		message: 'Run formatter first? (bun run format)',
		initialValue: false
	});
	if (isCancel(runFormatFirst)) {
		p.cancel('Cancelled.');
		process.exit(0);
	}

	if (runFormatFirst) {
		await runOrExit('Running format', ['bun', 'run', 'format']);
	}

	// Lint should be mandatory
	await runOrExit('Running lint', ['bun', 'run', 'lint']);
}

const summaryAfter = await getChangedSummary();
if (summaryAfter) {
	p.note('Formatter may have updated files. Review changes before committing if needed.', 'Info');
}

const statusSummary = await getChangedSummary();
if (!statusSummary) {
	p.note('No changes detected (working tree clean).', 'Info');
}

const type = await p.select({
	message: 'Select commit type',
	options: TYPES.map((t) => ({
		value: t.value,
		label: t.label,
		hint: t.hint
	}))
});
if (isCancel(type)) {
	p.cancel('Cancelled.');
	process.exit(0);
}

const scopeChoice = await p.autocomplete({
	message: 'Scope (optional)',
	options: SCOPE_SUGGESTIONS.map((s) => ({ value: s, label: s })),
	placeholder: 'e.g. user / prisma / auth (or leave empty)'
});
if (isCancel(scopeChoice)) {
	p.cancel('Cancelled.');
	process.exit(0);
}
const scope = scopeChoice && String(scopeChoice) !== '(none)' ? String(scopeChoice) : null;

const breaking = await p.confirm({
	message: 'Is this a breaking change?',
	initialValue: false
});
if (isCancel(breaking)) {
	p.cancel('Cancelled.');
	process.exit(0);
}

const subjectRaw = await p.text({
	message: 'Subject (one line) — e.g. add user create endpoint',
	placeholder: 'what & why (keep it concise)',
	validate: (v) => {
		const s = (v ?? '').trim();
		if (!s) return 'Subject is required.';
		if (s.length > 72) return 'Tip: keep subject <= 72 characters.';
		if (s.endsWith('.')) return 'Avoid a trailing period.';
		return;
	}
});
if (isCancel(subjectRaw)) {
	p.cancel('Cancelled.');
	process.exit(0);
}
const subject = sanitizeSubject(String(subjectRaw));

const body = await p.text({
	message: 'Body (optional) — explain context/why (multi-line allowed)',
	placeholder: 'context, reasoning, behavior changes, migration notes…'
});
if (isCancel(body)) {
	p.cancel('Cancelled.');
	process.exit(0);
}

const issueRef = await p.text({
	message: 'Issue/Ticket (optional) — e.g. #123',
	placeholder: '#123'
});
if (isCancel(issueRef)) {
	p.cancel('Cancelled.');
	process.exit(0);
}

const autoStage = await p.confirm({
	message: 'Auto-stage all changes? (git add -A)',
	initialValue: true
});
if (isCancel(autoStage)) {
	p.cancel('Cancelled.');
	process.exit(0);
}

const header = buildHeader(type as CommitType, scope, Boolean(breaking), subject);

let message = header;

const bodyText = String(body ?? '').trim();
if (bodyText) message += `\n\n${bodyText}`;

const issueText = String(issueRef ?? '').trim();
if (issueText) message += `\n\nRefs: ${issueText}`;

if (breaking) {
	message += `\n\nBREAKING CHANGE: describe impact/migration`;
}

p.note(
	`${pc.bold('Preview')}\n\n${pc.green(message)}${
		statusSummary ? `\n\n${pc.dim('Changes (top 10):')}\n${pc.dim(statusSummary)}` : ''
	}`,
	'Commit message'
);

const ok = await p.confirm({
	message: 'Proceed with commit?',
	initialValue: true
});
if (isCancel(ok) || !ok) {
	p.cancel('Cancelled.');
	process.exit(0);
}

if (autoStage) {
	await run(['git', 'add', '-A']);
}

await run(['git', 'commit', '-m', message]);

p.outro(pc.green('✅ Commit created.'));
