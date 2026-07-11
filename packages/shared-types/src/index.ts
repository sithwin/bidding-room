export type { User, UserStatus, UserRole } from './domain/user.js';
export type { Lot, LotCondition, LotImage } from './domain/lot.js';
export type { LotAuctionStatus, Bid, LotStatus } from './domain/auction.js';
export type { Invoice, InvoiceStatus } from './domain/payment.js';
export type {
  Fulfilment,
  FulfilmentMethod,
  FulfilmentStatus,
  ShippingAddress,
  CollectionSlot,
} from './domain/shipping.js';
export type {
  UserRegisteredPayload,
  PhoneVerificationRequestedPayload,
  BidPlacedPayload,
  AuctionClosingSoonPayload,
  AuctionClosedPayload,
  InvoiceCreatedPayload,
  PaymentReceivedPayload,
  InvoiceExpiredPayload,
  ItemDispatchedPayload,
  ItemCollectedPayload,
} from './events/index.js';
export { ROUTING_KEYS } from './events/index.js';
export type { RoutingKey } from './events/index.js';
export { envelope, listEnvelope } from './api/envelope.js';
export {
  catalogueLotSchema, catalogueLotImageSchema, lotListResponseSchema, lotResponseSchema,
  lotSearchResultSchema, lotSearchResponseSchema, categorySchema, categoryListResponseSchema,
  auctionStatusSchema, catalogueAuctionSchema, auctionListResponseSchema, auctionResponseSchema,
  facetsResponseSchema, lotsQuery, auctionsQuery, lotActiveStatusSchema, LOT_ACTIVE_STATUSES,
} from './api/catalogue.js';
export type { CatalogueLot, CatalogueLotImage, CatalogueAuction } from './api/catalogue.js';
export {
  auctionResultRowSchema, auctionResultsResponseSchema, unsoldLotRowSchema, unsoldLotsResponseSchema,
} from './api/auction-reports.js';
export type { AuctionResultReportRow, UnsoldLotReportRow } from './api/auction-reports.js';
export {
  revenueReportSchema, revenueReportResponseSchema,
  pendingInvoiceCountSchema, pendingInvoiceCountResponseSchema,
} from './api/payment-reports.js';
export type { RevenueReport, PendingInvoiceCount } from './api/payment-reports.js';
export { pendingFulfilmentCountSchema, pendingFulfilmentCountResponseSchema } from './api/shipping-reports.js';
export type { PendingFulfilmentCount } from './api/shipping-reports.js';
export {
  apiErrorSchema, stringErrorSchema, userStatusSchema, userRoleSchema, messageResponseSchema,
  accessTokenResponseSchema, meSchema, meResponseSchema, emailLookupResponseSchema,
  identityDocumentResponseSchema, adminUserSummarySchema, adminUserDetailSchema,
  adminUserListResponseSchema, adminUserResponseSchema, adminUserIdResponseSchema,
  registerRequestSchema, loginRequestSchema, verifyEmailRequestSchema, phoneRequestSchema,
  phoneVerifyRequestSchema, updateProfileRequestSchema, adminCreateUserRequestSchema,
  adminUpdateUserRequestSchema, usersQuery,
} from './api/user-auth.js';
export type { Me, AdminUserSummary, AdminUserDetail } from './api/user-auth.js';
export {
  auctionLotStatusValueSchema, auctionLotStatusSchema, lotStatusResponseSchema,
  lotStatusListResponseSchema, auctionBidSchema, bidListResponseSchema, placeBidRequestSchema,
  placeBidResponseSchema, scheduleAuctionRequestSchema, scheduleAuctionResponseSchema,
  dashboardStatsResponseSchema, auctionsListQuery, bidHistoryQuery,
} from './api/auction-engine.js';
export type { AuctionLotStatus, AuctionBid } from './api/auction-engine.js';
