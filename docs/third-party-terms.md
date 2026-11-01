# Third-party service terms

This is a non-legal summary for project operators, not a determination that a deployment complies with any provider agreement. Provider terms, regional availability, and policies can change. The project owner must review the current applicable agreements before connecting a provider or sending non-synthetic data.

## PayPal

JOBENPAY calls PayPal Sandbox APIs for OAuth, Payouts, and signed-webhook verification. PayPal's published U.S. User Agreement says that it governs PayPal account/services use and references the Acceptable Use Policy and other applicable legal agreements; it also allows terms to change. That public account agreement alone does not establish which API/developer terms apply to a particular business, jurisdiction, or integration.

- [PayPal U.S. User Agreement](https://www.paypal.com/us/legalhub/paypal/useragreement-full)
- [PayPal Developer documentation](https://developer.paypal.com/)
- [PayPal Legal Agreements](https://www.paypal.com/us/webapps/mpp/ua/legalhub-full)

**Manual review required by the owner:** identify and review the current API/developer agreement, Sandbox and Payouts conditions, webhook requirements, business-account eligibility, fees, and any restrictions for the operator's jurisdiction. The project's sandbox-only setting is not a substitute for provider approval or legal review.

## OpenAI

The OpenAI adapter is optional and is not contacted when `AI_PROVIDER=replay`. A deployment selecting OpenAI must follow the terms and policies applicable to its API account and model use.

- [OpenAI Platform Terms](https://openai.com/policies/services-agreement/)
- [OpenAI Usage Policies](https://openai.com/policies/usage-policies/)

The linked policy pages could not be fully verified in this documentation pass. **Manual review required by the owner:** current API service terms, usage policy, data processing terms, retention/training settings, regional availability, and whether invoice data may be submitted. No claim is made here about those terms.

## Anthropic

The Anthropic adapter is optional and is not contacted when `AI_PROVIDER=replay`. Anthropic's published Commercial Terms cover API keys and related services, refer to its Usage Policy, Supported Regions Policy, Service Specific Terms, and Data Processing Addendum, and describe customer content rights and model-training treatment. Applicable terms depend on the customer and may change.

- [Anthropic Commercial Terms](https://www.anthropic.com/legal/commercial-terms)
- [Anthropic Usage Policy](https://console.anthropic.com/legal/aup)
- [Anthropic Data Processing Addendum](https://www.anthropic.com/legal/data-processing-addendum)

**Manual review required by the owner:** confirm the current terms, DPA, provider settings, supported region, and suitability of invoice data for the intended deployment. Do not send secrets or raw payment credentials to an AI provider.

## Local replay mode

`AI_PROVIDER=replay` reads local fixtures and makes no request to an external AI service. It does not remove obligations that may apply to PayPal or to other services separately configured by an operator.
