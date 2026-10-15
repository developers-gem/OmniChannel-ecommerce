import {
  ChannelType,
  ChannelStatus,
  UserRole,
  ProductStatus,
  ChannelProductStatus,
  SyncStatus,
  MappingConfidence,
  MappingStatus,
  AllocationType,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
  NotificationSeverity,
  NotificationCategory,
} from '../enums';

export interface UserClaims {
  userId: string;
  email: string;
  organizationId: string;
  role: UserRole;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface IProductOption {
  name: string;
  value: string;
}

export interface IProductImage {
  url: string;
  altText?: string;
  position?: number;
  isPrimary?: boolean;
}

export interface IPriceModifier {
  type: 'FIXED' | 'PERCENTAGE';
  value: number;
}

export interface IAddress {
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  phone?: string;
}

export interface PnLSummaryMetrics {
  totalRevenue: number;
  totalDiscounts: number;
  totalRefunds: number;
  netRevenue: number;
  cogs: number;
  marketplaceFees: number;
  shippingExpenses: number;
  grossProfit: number;
  netContribution: number;
  grossMarginPercentage: number;
  netMarginPercentage: number;
  unrecordedExpenseCount: number;
}
