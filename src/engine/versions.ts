// Earlier seasons keep their original rules through replay, branching, sharing and comparison.
export const CURRENT_RULES_VERSION = 'lantern-7.0.0';
export const CAREER_RULES_VERSION = 'lantern-7.0.0';
export const CREATIVE_PROMISE_RULES_VERSION = 'lantern-6.1.0';
export const AUTHORSHIP_RULES_VERSION = 'lantern-6.0.0';
export const STUDIO_RULES_VERSION = 'lantern-5.0.0';
export const LEGACY_RULES_VERSION = 'lantern-4.7.1';

export function supportsRulesVersion(version: string): boolean {
  return hasStudioRules(version) || version === LEGACY_RULES_VERSION;
}

export function hasStudioRules(version: string): boolean {
  return hasAuthorshipRules(version) || version === STUDIO_RULES_VERSION;
}

export function hasAuthorshipRules(version: string): boolean {
  return hasCreativePromiseRules(version) || version === AUTHORSHIP_RULES_VERSION;
}

export function hasCreativePromiseRules(version: string): boolean {
  return version === CREATIVE_PROMISE_RULES_VERSION || hasCareerRules(version);
}

export function hasCareerRules(version: string): boolean {
  return version === CAREER_RULES_VERSION;
}
