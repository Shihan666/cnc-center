import type {
  CanonicalCommerceCurrency,
  CommerceShippingClass,
  ShippingMethodId,
} from "../../config/commerce.ts";

export interface CheckoutSubmissionItem {
  productId: string;
  quantity: number;
}

export interface CheckoutSubmissionInput {
  items: CheckoutSubmissionItem[];

  name: string;
  phone: string;
  city: string;

  address: string;

  shippingMethodId:
    ShippingMethodId;

  notes: string;
}

export interface PreparedOrderCustomer {
  name: string;
  phone: string;
  city: string;
  address: string;
  notes: string;
}

export interface PreparedOrderLine {
  productId: string;

  name: string;
  brand: string;
  partNumber: string;

  quantity: number;

  unitPriceRial: number;
  lineTotalRial: number;

  shippingClass:
    CommerceShippingClass;
}

export interface PreparedOrderDraft {
  customer:
    PreparedOrderCustomer;

  lines:
    PreparedOrderLine[];

  shippingMethodId:
    ShippingMethodId;

  shippingMethodLabel:
    string;

  subtotalRial:
    number;

  shippingFeeRial:
    number | null;

  totalRial:
    number | null;

  currency:
    CanonicalCommerceCurrency;

  paymentReady:
    boolean;
}

export type OrderPreparationErrorCode =
  | "empty-cart"
  | "too-many-items"
  | "invalid-item"
  | "duplicate-product"
  | "product-unavailable"
  | "invalid-quantity"
  | "invalid-name"
  | "invalid-phone"
  | "invalid-city"
  | "invalid-shipping-method"
  | "shipping-method-ineligible"
  | "address-required"
  | "invalid-notes"
  | "invalid-shipping-fee"
  | "amount-overflow";

export interface OrderPreparationError {
  code:
    OrderPreparationErrorCode;

  message:
    string;

  productId?:
    string;
}

export type PrepareOrderResult =
  | {
      ok: true;

      order:
        PreparedOrderDraft;
    }
  | {
      ok: false;

      errors:
        OrderPreparationError[];
    };
