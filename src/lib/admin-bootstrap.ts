export type BootstrapUser = { role: "ADMIN" | "EMPLOYEE"; active: boolean } | null;

/**
 * The configured owner account may be created after a sample seed has added
 * employees. A user at the configured email is never promoted implicitly: it
 * must authenticate through its own password/reset flow instead.
 */
export function canBootstrapAdmin(input: {
  emailMatches: boolean;
  passwordMatches: boolean;
  activeAdminCount: number;
  existingUser: BootstrapUser;
}) {
  return input.emailMatches && input.passwordMatches && input.activeAdminCount === 0 && input.existingUser === null;
}
