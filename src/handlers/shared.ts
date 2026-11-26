/** The shapes the handlers share. */
import type { JsonSchema } from "@we-the-rebel-alliance/plugin-contract/manifest"

/** A method that takes no input. The register adds the account selector to a method that takes an account. */
export const EMPTY: JsonSchema = { type: "object", properties: {}, additionalProperties: false }

/**
 * The answer `probe` gives: the account, OpenCode's own connection identity for it, and the contract's trust mark.
 *
 * There is no source in this plugin, so the answer carries none, and the contract's `PROBE_SCHEMA` (which requires
 * one) is not used.
 */
export const PROBE_OUTPUT: JsonSchema = {
  type: "object",
  properties: {
    account: { type: "string", minLength: 1 },
    owner: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1 },
        label: { type: "string", minLength: 1 },
        verified: { type: "boolean" },
      },
      required: ["id", "label", "verified"],
      additionalProperties: false,
    },
    trust: { type: "string", enum: ["untrusted"] },
  },
  required: ["account", "owner", "trust"],
  additionalProperties: false,
}
