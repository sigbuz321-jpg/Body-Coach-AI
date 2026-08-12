/**
 * @bodycoach/whatsapp — client, template, interactive builder untuk
 * Meta WhatsApp Cloud API.
 *
 * JANGAN PERNAH memakai library tidak resmi (Baileys, whatsapp-web.js).
 */

export const WHATSAPP_PACKAGE = '@bodycoach/whatsapp' as const;

export { createWhatsAppClient, hashWaId, WhatsAppError } from './client';
export type { SendResult, WhatsAppClient, WhatsAppClientOptions } from './client';

export {
  buildInteractiveMessage,
  buildListMessage,
  buildTextMessage,
  foodConfirmButtons,
  foodCorrectionSections,
  parseButtonId,
  MAX_BODY,
  MAX_BUTTONS,
  MAX_BUTTON_TITLE,
  MAX_FOOTER,
  MAX_LIST_BUTTON,
  MAX_LIST_ROWS,
  MAX_ROW_DESC,
  MAX_ROW_TITLE,
} from './interactive';
export type { ButtonAction } from './interactive';

export { computeSignature, verifySignature, verifyWebhookChallenge } from './signature';

export { buildTemplateMessage, TEMPLATES } from './templates';
export type { TemplateDefinition, TemplateName } from './templates';

export { extractMessages } from './types';
export type {
  IncomingMessage,
  IncomingMessageType,
  OutboundButton,
  OutboundInteractive,
  OutboundList,
  OutboundListRow,
  OutboundListSection,
  OutboundText,
} from './types';
