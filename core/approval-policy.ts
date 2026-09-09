const APPROVAL_PREFIX = "APPROVE ACTION:";

export const PROTECTED_ACTIONS = ["delete-remove", "push-main", "merge-pr", "post-web"] as const;
export type ProtectedAction = (typeof PROTECTED_ACTIONS)[number];

const MERGE_PR_COMMAND = /\b(?:gh\s+pr\s+merge|glab\s+mr\s+merge)\b/i;
const PUSH_MAIN_COMMAND = /\bgit\s+push\b[^\n;&|]*(?:\b(?:main|master)\b|HEAD:(?:refs\/heads\/)?(?:main|master)\b)/i;
const ANY_PUSH_COMMAND = /\bgit\s+push\b/i;
const DELETE_REMOVE_COMMAND =
  /(?:^|[;&|]|\n)\s*(?:sudo\s+)?(?:rm|rmdir|unlink|trash|git\s+(?:clean|rm|branch\s+(?:-d|-D|--delete)|tag\s+(?:-d|--delete)|remote\s+remove)|find\b[^\n;&|]*\s-delete\b|gh\s+(?:repo|release)\s+delete|npm\s+(?:remove|uninstall)|pnpm\s+(?:remove|uninstall)|yarn\s+remove|bun\s+remove|pipx?\s+uninstall|brew\s+uninstall|apt(?:-get)?\s+(?:remove|purge))\b/i;
const WEB_POST_COMMAND =
  /\b(?:(?:omp|pi)\s+(?:share|collab)\b|gh\s+(?:pr\s+(?:create|comment|review)|issue\s+(?:create|comment)|release\s+create)|glab\s+(?:mr\s+create|issue\s+create)|npm\s+publish|twine\s+upload|curl\b[^\n]*(?:-X|--request)\s*(?:POST|PUT|PATCH|DELETE)|curl\b[^\n]*(?:-d|--data|--data-raw|--data-binary|-F|--form|-T|--upload-file)\b|wget\b[^\n]*(?:--post-(?:data|file)\b|--method(?:=|\s+)(?:POST|PUT|PATCH|DELETE)\b))\b/i;
const WEB_PLATFORM_MUTATION_COMMAND =
  /\b(?:gh\s+(?:repo|gist|project)\s+(?:create|edit)|gh\s+api\b[^\n]*(?:(?:-X|--method)\s*(?:POST|PUT|PATCH|DELETE)|(?:-f|-F|--field|--raw-field)\s)|(?:vercel|netlify|firebase|wrangler)\s+(?:deploy|publish))\b/i;

const MERGE_PR_TOOL = /(?:^|[_-])(?:merge[_-]?(?:pr|pull[_-]?request|mr)|(?:pr|pull[_-]?request|mr)[_-]?merge)(?:$|[_-])/i;
const DELETE_REMOVE_TOOL = /(?:^|[_-])(?:delete|remove|uninstall)(?:$|[_-])/i;
const WEB_POST_TOOL =
  /(?:^|[_-])(?:send|post|publish|reply|comment|message|upload|deploy|create[_-]?(?:issue|pr|pull[_-]?request|release|session)|session[_-]?create|update[_-]?(?:comment|post|status))(?:$|[_-])/i;

export function parseApproval(text: string): ProtectedAction | undefined {
  const normalized = text.trim();
  return PROTECTED_ACTIONS.find((action) => normalized === `${APPROVAL_PREFIX} ${action}`);
}

export function approvalInstruction(action: ProtectedAction): string {
  return `${APPROVAL_PREFIX} ${action}`;
}

export function approvalPolicyFromEnvironment(
  environment: Record<string, string | undefined> = process.env,
): "ask" | "allow" {
  const value = environment.PIMARG_APPROVAL_POLICY
    ?? environment.UNIVERSAL_AUTO_MODE_APPROVAL_POLICY
    ?? environment.OMP_AUTO_MODE_APPROVAL_POLICY
    ?? "ask";
  return value.trim().toLowerCase() === "allow" ? "allow" : "ask";
}

export function classifyInput(text: string): ProtectedAction | undefined {
  const command = text.trim().split(/\s+/, 1)[0]?.toLowerCase();
  return command === "/collab" || command === "/share" ? "post-web" : undefined;
}

export function classifyToolCall(
  toolName: string,
  input: Record<string, unknown> | undefined,
): ProtectedAction | undefined {
  const normalizedName = toolName.toLowerCase();

  if (normalizedName === "bash") {
    const command = commandFrom(input);
    if (MERGE_PR_COMMAND.test(command)) return "merge-pr";
    if (PUSH_MAIN_COMMAND.test(command)) return "push-main";
    if (DELETE_REMOVE_COMMAND.test(command)) return "delete-remove";
    if (ANY_PUSH_COMMAND.test(command) || WEB_POST_COMMAND.test(command) || WEB_PLATFORM_MUTATION_COMMAND.test(command)) return "post-web";
    return undefined;
  }

  if (MERGE_PR_TOOL.test(normalizedName)) return "merge-pr";
  if (DELETE_REMOVE_TOOL.test(normalizedName)) return "delete-remove";
  if (WEB_POST_TOOL.test(normalizedName)) return "post-web";

  if (/(?:browser|web|github|gitlab|slack|teams|notion|linear|jira|email|social|crm|devin)/i.test(normalizedName)) {
    const payload = stringifyInput(input);
    if (!/\b(?:post|publish|send|submit|reply|comment|message|upload|merge)\b/i.test(payload)) {
      return undefined;
    }
    if (/\bmerge\b/i.test(payload) && /\b(?:pr|pull request|merge request|mr)\b/i.test(payload)) {
      return "merge-pr";
    }
    return "post-web";
  }

  return undefined;
}

export class OneUseApprovals {
  private readonly actions = new Set<ProtectedAction>();

  grant(action: ProtectedAction): void {
    this.actions.add(action);
  }

  consume(action: ProtectedAction): boolean {
    if (!this.actions.has(action)) return false;
    this.actions.delete(action);
    return true;
  }

  clear(): void {
    this.actions.clear();
  }
}

function stringifyInput(input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  try {
    return JSON.stringify(input);
  } catch {
    return "";
  }
}

function commandFrom(input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  const candidate = input.command ?? input.cmd;
  return typeof candidate === "string" ? candidate : "";
}
