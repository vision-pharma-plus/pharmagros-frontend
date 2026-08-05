/**
 * API response types.
 *
 * Hand-written rather than generated from the OpenAPI schema. The schema is
 * available (`manage.py spectacular`) and generation is the right long-term
 * answer, but these cover the screens that exist and keep the build free of a
 * codegen step for now.
 *
 * Monetary fields are typed `string`, never `number` — the backend sends them
 * as decimal strings and parsing to `number` would lose precision.
 */

export type Money = string;
export type Quantity = string;
export type UUID = string;

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export interface User {
  id: UUID;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  employee_code: string;
  job_title: string;
  language: "fr" | "en";
  roles: UUID[];
  role_codes: string[];
  /** Effective permission codes; used for UI gating only. */
  permissions: string[];
  is_active: boolean;
  is_staff: boolean;
  is_suspended: boolean;
  mfa_enabled: boolean;
  must_change_password: boolean;
  last_login: string | null;
  created_at: string;
}

export interface Role {
  id: UUID;
  code: string;
  // `name`/`description` are resolved read-only values for the active
  // language; the paired columns behind them are what a client writes.
  name: string;
  name_fr: string;
  name_en: string;
  description: string;
  description_fr: string;
  description_en: string;
  permissions: number[];
  permission_codes: string[];
  inherits_from: UUID | null;
  is_system: boolean;
  is_active: boolean;
  user_count: number;
}

export interface Permission {
  id: number;
  code: string;
  name: string;
  module: string;
  is_sensitive: boolean;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export interface MedicineListItem {
  id: UUID;
  product_code: string;
  name: string;
  generic_name: string;
  display_name: string;
  strength: string;
  dosage_form: string;
  category: UUID;
  category_name: string;
  manufacturer_name: string;
  unit_code: string;
  selling_price: Money;
  /**
   * Catalogue *reference* cost, not the price of any actual purchase. Offered
   * as the starting value for a purchase order line; the real cost of stock is
   * the received batch's landed cost.
   */
  unit_cost: Money;
  status: string;
  requires_prescription: boolean;
  is_controlled: boolean;
  barcode: string;
  /** 0 for VAT-exempt products; drives the point-of-sale total preview. */
  effective_vat_rate: string;
}

export interface Medicine extends MedicineListItem {
  brand_name: string;
  pack_size: string;
  manufacturer: UUID | null;
  unit_of_measure: UUID;
  wholesale_price: Money;
  vat_rate: string;
  is_vat_exempt: boolean;
  effective_vat_rate: string;
  reorder_level: Quantity;
  safety_stock: Quantity;
  max_stock_level: Quantity;
  expiry_alert_days: number;
  storage_condition: string;
  storage_notes: string;
  requires_cold_chain: boolean;
  atc_code: string;
  registration_number: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: UUID;
  code: string;
  name: string;
  name_fr: string;
  name_en: string;
  parent: UUID | null;
  parent_name: string;
  description: string;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Catalogue import
// ---------------------------------------------------------------------------

/** One column of the spreadsheet format, as the server defines it. */
export interface ImportColumnSpec {
  key: string;
  header: string;
  required: boolean;
  hint: string;
  example: string;
}

export interface ImportFormat {
  max_rows: number;
  columns: ImportColumnSpec[];
}

export interface ImportRowError {
  /** 1-based row number as shown in Excel, so the user can go straight to it. */
  row_number: number;
  /** Echoed from the row so the error can be labelled recognisably. */
  name: string;
  errors: Record<string, string[]>;
}

export interface ImportReport {
  total_rows: number;
  valid_count: number;
  error_count: number;
  created: number;
  updated: number;
  /** Set when the file itself is unusable; the row list is then meaningless. */
  fatal_error: string;
  errors: ImportRowError[];
  /** False for a preview, and for any file that was rejected wholesale. */
  committed: boolean;
}

export interface Manufacturer {
  id: UUID;
  code: string;
  name: string;
  country: string;
  contact_email: string;
  contact_phone: string;
  website: string;
  is_active: boolean;
}

export interface UnitOfMeasure {
  id: UUID;
  code: string;
  name: string;
  name_fr: string;
  name_en: string;
  base_unit: string;
  units_per_pack: number;
  is_active: boolean;
}

export interface PriceHistoryEntry {
  id: number;
  medicine: UUID;
  old_unit_cost: Money;
  new_unit_cost: Money;
  old_selling_price: Money;
  new_selling_price: Money;
  reason: string;
  changed_by_name: string;
  effective_from: string;
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export interface Warehouse {
  id: UUID;
  code: string;
  /** Resolved for the active language; read-only. Write `name_fr`/`name_en`. */
  name: string;
  name_fr: string;
  name_en: string;
  address: string;
  city: string;
  is_default: boolean;
  is_active: boolean;
  is_cold_chain: boolean;
}

export interface StockBatch {
  id: UUID;
  product: UUID;
  product_code: string;
  product_name: string;
  warehouse: UUID;
  warehouse_code: string;
  batch_number: string;
  manufacturing_date: string | null;
  expiry_date: string;
  days_to_expiry: number;
  is_expired: boolean;
  supplier: UUID | null;
  supplier_name: string;
  quantity_received: Quantity;
  quantity_remaining: Quantity;
  quantity_reserved: Quantity;
  quantity_available: Quantity;
  unit_cost: Money;
  landed_unit_cost: Money;
  stock_value: Money;
  status: string;
  received_at: string;
  notes: string;
}

export interface StockMovement {
  id: UUID;
  batch: UUID;
  batch_number: string;
  product: UUID;
  product_code: string;
  product_name: string;
  warehouse_code: string;
  movement_type: string;
  movement_type_display: string;
  quantity_delta: Quantity;
  balance_after: Quantity;
  unit_cost: Money;
  total_value: Money;
  source_type: string;
  source_reference: string;
  performed_by_name: string;
  performed_at: string;
  reason: string;
}

export interface StockLevel {
  product_id: UUID;
  product_code: string;
  product_name: string;
  reorder_level: Quantity;
  quantity_on_hand: Quantity;
  quantity_available: Quantity;
  batch_count: number;
  is_low: boolean;
  is_out: boolean;
}

// ---------------------------------------------------------------------------
// Partners
// ---------------------------------------------------------------------------

export interface CustomerListItem {
  id: UUID;
  customer_code: string;
  business_name: string;
  customer_type: string;
  nif: string;
  city: string;
  phone: string;
  email: string;
  status: string;
  credit_limit: Money;
  outstanding_balance: Money;
  available_credit: Money;
  credit_blocked: boolean;
  credit_block_reason: string;
  is_over_limit: boolean;
  /**
   * Whether credit is permitted at all — active, not blocked, not cash-only
   * and carrying a limit. Independent of `available_credit`, which only
   * measures headroom and is meaningless when this is false.
   */
  is_credit_eligible: boolean;
  licence_is_expired: boolean;
  payment_terms: string;
}

export interface Customer extends CustomerListItem {
  trading_name: string;
  rc_number: string;
  pharmacy_licence: string;
  licence_expiry: string | null;
  contact_person: string;
  alternate_phone: string;
  address: string;
  province: string;
  country: string;
  credit_utilisation: string;
  payment_term_days: number;
  discount_percent: string;
  is_institutional: boolean;
  notes: string;
  first_sale_at: string | null;
  last_sale_at: string | null;
}

export interface Supplier {
  id: UUID;
  supplier_code: string;
  name: string;
  nif: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  payment_terms: string;
  payment_term_days: number;
  currency: string;
  lead_time_days: number;
  bank_name: string;
  bank_account: string;
  swift_code: string;
  status: string;
  is_approved: boolean;
  approval_notes: string;
  notes: string;
}

export interface StatementLine {
  date: string;
  type: string;
  reference: string;
  debit: Money;
  credit: Money;
  balance: Money;
  due_date: string | null;
}

export interface CustomerStatement {
  customer_code: string;
  business_name: string;
  date_from: string | null;
  date_to: string;
  lines: StatementLine[];
  total_invoiced: Money;
  total_paid: Money;
  closing_balance: Money;
  currency: string;
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export interface SaleLineBatch {
  id: number;
  batch: UUID;
  batch_number: string;
  expiry_date: string;
  quantity: Quantity;
  quantity_returned: Quantity;
  unit_cost: Money;
}

export interface SaleLine {
  id: number;
  line_number: number;
  product: UUID;
  product_code: string;
  product_name: string;
  quantity: Quantity;
  quantity_returned: Quantity;
  quantity_net: Quantity;
  unit_price: Money;
  discount_percent: string;
  discount_amount: Money;
  tax_rate: string;
  tax_amount: Money;
  line_subtotal: Money;
  line_total: Money;
  batch_allocations: SaleLineBatch[];
}

export interface SaleListItem {
  id: UUID;
  sale_number: string;
  sale_type: string;
  status: string;
  customer: UUID;
  customer_code: string;
  customer_name: string;
  warehouse_code: string;
  sale_date: string;
  total_amount: Money;
  invoice_number: string | null;
}

export interface Sale extends SaleListItem {
  warehouse: UUID;
  subtotal: Money;
  discount_percent: string;
  discount_amount: Money;
  tax_amount: Money;
  salesperson: UUID | null;
  salesperson_name: string;
  delivery_address: string;
  customer_order_reference: string;
  credit_override_reason: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string;
  is_editable: boolean;
  notes: string;
  lines: SaleLine[];
  /** Present on the confirm response. */
  invoice_id?: string | null;
  /**
   * Present on the confirm response for a cash sale, which closes with a
   * receipt rather than an invoice.
   */
  receipt_id?: string | null;
  receipt_number?: string | null;
}

export interface SalesReceiptListItem {
  id: UUID;
  receipt_number: string;
  sale: UUID;
  sale_number: string;
  customer: UUID;
  customer_name: string;
  issued_at: string;
  payment_method: string;
  total_amount: Money;
  is_cancelled: boolean;
  /** Whether an invoice was later raised for this same sale. */
  has_invoice: boolean;
  invoice_number: string | null;
}

export interface SalesReceipt extends SalesReceiptListItem {
  sale_status: string;
  customer_nif: string;
  payment_reference: string;
  subtotal: Money;
  discount_amount: Money;
  tax_amount: Money;
  amount_tendered: Money;
  change_given: Money;
  issued_by: UUID | null;
  notes: string;
  print_count: number;
  last_printed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string;
  invoice_id: string | null;
  /** The sale's lines, which the receipt renders as its own. */
  lines: SaleLine[];
  created_at: string;
}

export interface RecallRecipient {
  sale_number: string;
  sale_date: string;
  customer_code: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  product: string;
  batch_number: string;
  expiry_date: string;
  quantity_supplied: Quantity;
  quantity_returned: Quantity;
  quantity_outstanding: Quantity;
}

export interface SaleReturnLine {
  id: number;
  sale_line: number;
  product_name: string;
  batch: UUID;
  batch_number: string;
  quantity: Quantity;
  unit_price: Money;
  refund_amount: Money;
  restock: boolean;
  condition_notes: string;
}

/**
 * A return is always raised against the sale it reverses, so the API exposes
 * list and retrieve only — there is no standalone create route to type here.
 */
export interface SaleReturn {
  id: UUID;
  return_number: string;
  sale: UUID;
  sale_number: string;
  customer: UUID;
  customer_name: string;
  return_date: string;
  reason: string;
  total_amount: Money;
  credit_note: UUID | null;
  credit_note_number: string | null;
  notes: string;
  lines: SaleReturnLine[];
  created_at: string;
}

// ---------------------------------------------------------------------------
// Invoicing
// ---------------------------------------------------------------------------

export interface InvoiceLine {
  id: number;
  line_number: number;
  product: UUID | null;
  product_code: string;
  description: string;
  batch_numbers: string;
  expiry_dates: string;
  quantity: Quantity;
  unit_of_measure: string;
  unit_price: Money;
  discount_percent: string;
  discount_amount: Money;
  tax_rate: string;
  tax_amount: Money;
  line_subtotal: Money;
  line_total: Money;

  // The sale line this was billed from, and what is still returnable on it.
  // Null when the invoice has no sale behind it (a manually raised invoice),
  // in which case a credit note can only be a financial correction — there
  // are no batch allocations to return stock into.
  sale_line: number | null;
  returnable_quantity: Quantity | null;
}

/** Why an issued invoice was corrected. */
export type CreditNoteReason =
  | "WRONG_QUANTITY"
  | "WRONG_PRICE"
  | "GOODS_RETURNED"
  | "GOODS_DAMAGED"
  | "DISCOUNT_GRANTED"
  | "OTHER";

/** The two reasons that mean stock physically came back. */
export const GOODS_RETURN_REASONS: readonly CreditNoteReason[] = [
  "GOODS_RETURNED",
  "GOODS_DAMAGED",
];

/** A credit note as it appears on the invoice it corrects. */
export interface InvoiceCorrection {
  id: UUID;
  invoice_number: string;
  invoice_type: string;
  status: string;
  invoice_date: string;
  total_amount: Money;
  credit_reason_code: CreditNoteReason | "";
  notes: string;
}

/**
 * Where a document stands with the OBR.
 *
 * Tracked separately from `status`: commercial state (is it paid?) and fiscal
 * state (is it declared?) move independently, so one field cannot answer both.
 */
export type FiscalStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "DECLARED"
  | "REJECTED"
  | "CANCELLED";

export interface InvoiceListItem {
  id: UUID;
  invoice_number: string;
  invoice_type: string;
  status: string;
  customer: UUID;
  customer_name: string;
  customer_nif: string;
  invoice_date: string;
  due_date: string | null;
  is_credit_sale: boolean;
  total_amount: Money;
  paid_amount: Money;
  balance_due: Money;
  is_overdue: boolean;
  days_overdue: number;
  fiscal_status: FiscalStatus;
}

export interface Invoice extends InvoiceListItem {
  customer_code: string;
  customer_address: string;
  customer_phone: string;
  sale: UUID | null;
  sale_number: string | null;
  payment_terms_days: number;
  subtotal: Money;
  discount_amount: Money;
  taxable_amount: Money;
  tax_amount: Money;
  currency: string;
  reference: string;
  notes: string;
  posted_at: string | null;
  posted_by_name: string;
  cancelled_at: string | null;
  cancellation_reason: string;
  print_count: number;
  original_invoice: UUID | null;
  original_invoice_number: string | null;
  /** The receipt raised when this invoice was settled in full, if it was. */
  payment_receipt_id: string | null;
  payment_receipt_number: string | null;
  credit_reason_code: CreditNoteReason | "";
  corrections: InvoiceCorrection[];
  is_editable: boolean;
  payment_progress: string;
  /** What settled this invoice, newest first. Detail responses only. */
  payment_allocations: InvoiceAllocation[];
  /**
   * True when a credit note was applied to this invoice.
   *
   * Not derivable client-side: a credit-note offset zeroes `balance_due`
   * exactly as a cash payment would, so without this flag an invoice cleared
   * by a correction reads as "paid".
   */
  settled_by_credit_note: boolean;
  lines: InvoiceLine[];

  // --- OBR declaration ---
  // The signature is computed locally at posting time; everything else
  // arrives from the OBR on acceptance and stays empty until then.
  fiscal_signature: string;
  obr_registered_number: string;
  obr_registered_at: string | null;
  obr_electronic_signature: string;
  declared_at: string | null;
  declaration_attempts: number;
  last_declaration_error: string;
  is_declared: boolean;
  declaration_exhausted: boolean;
}

/**
 * One payment applied to an invoice — the invoice's view of the link.
 *
 * The mirror of `Payment.allocations`, which is the payment's view of the
 * same rows. Both exist because the relationship is many-to-many: one
 * transfer can settle several invoices, and one invoice can take several
 * instalments.
 */
export interface InvoiceAllocation {
  id: number;
  payment: UUID;
  payment_reference: string;
  payment_date: string;
  /** `CREDIT_NOTE` here means a correction, not money received. */
  method: string;
  bank_reference: string;
  /** A reversed payment keeps its row so a bounced cheque stays visible. */
  is_reversed: boolean;
  received_by_name: string;
  amount: Money;
  created_at: string;
}

export interface Payment {
  id: UUID;
  reference: string;
  customer: UUID;
  customer_code: string;
  customer_name: string;
  payment_date: string;
  amount: Money;
  allocated_amount: Money;
  unallocated_amount: Money;
  method: string;
  bank_reference: string;
  received_by_name: string;
  notes: string;
  is_reversed: boolean;
  reversal_reason: string;
  allocations: {
    id: number;
    invoice: UUID;
    invoice_number: string;
    amount: Money;
  }[];
}

// ---------------------------------------------------------------------------
// Purchasing
// ---------------------------------------------------------------------------

export interface PurchaseOrderLine {
  id: number;
  line_number: number;
  product: UUID;
  product_code: string;
  product_name: string;
  quantity_ordered: Quantity;
  quantity_received: Quantity;
  quantity_outstanding: Quantity;
  is_fully_received: boolean;
  unit_cost: Money;
  discount_percent: string;
  tax_rate: string;
  line_total: Money;
  expected_expiry_date: string | null;
  notes: string;
}

export interface PurchaseOrderListItem {
  id: UUID;
  order_number: string;
  status: string;
  supplier: UUID;
  supplier_name: string;
  warehouse_code: string;
  order_date: string;
  expected_delivery_date: string | null;
  total_amount: Money;
  currency: string;
  receipt_progress: string;
  is_overdue: boolean;
}

export interface PurchaseOrder extends PurchaseOrderListItem {
  supplier_code: string;
  warehouse: UUID;
  actual_delivery_date: string | null;
  subtotal: Money;
  discount_amount: Money;
  tax_amount: Money;
  freight_cost: Money;
  customs_duty: Money;
  other_charges: Money;
  landed_cost_total: Money;
  exchange_rate: string;
  payment_terms: string;
  supplier_reference: string;
  supplier_invoice_number: string;
  /** Raw id, needed to enforce separation of duties in the UI. */
  requested_by: UUID | null;
  requested_by_name: string;
  approved_by_name: string;
  approved_at: string | null;
  rejection_reason: string;
  is_editable: boolean;
  can_receive: boolean;
  is_fully_received: boolean;
  notes: string;
  lines: PurchaseOrderLine[];
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export interface DashboardKPIs {
  inventory: {
    total_value?: Money;
    total_products: number;
    total_batches: number;
    low_stock_products: number;
    out_of_stock_products: number;
    expiring_90_days: number;
    expired_batches: number;
  };
  sales: {
    daily_revenue: Money;
    daily_transactions: number;
    daily_margin?: Money;
    monthly_revenue: Money;
    monthly_transactions: number;
    monthly_margin?: Money;
    /** The window the figures above cover, so the tiles can label it. */
    period_start: string;
    period_end: string;
    /** True when an explicit range was applied rather than the defaults. */
    is_filtered: boolean;
  };
  receivables: {
    outstanding_total: Money;
    outstanding_count: number;
    overdue_total: Money;
    overdue_count: number;
  };
  currency: string;
  as_of: string;
}

export interface DashboardWidgets {
  revenue_trend: {
    date: string;
    revenue: Money;
    cost: Money;
    margin: Money;
    transactions: number;
  }[];
  top_customers: {
    customer_id: UUID;
    customer_code: string;
    business_name: string;
    revenue: Money;
    transactions: number;
  }[];
  top_products: {
    product_id: UUID;
    product_code: string;
    name: string;
    quantity_sold: Quantity;
    revenue: Money;
    margin: Money;
  }[];
}

export interface GoodsReceiptLine {
  id: number;
  purchase_order_line: number;
  product: UUID;
  product_name: string;
  batch: UUID | null;
  batch_number: string;
  manufacturing_date: string | null;
  expiry_date: string;
  quantity_received: Quantity;
  quantity_rejected: Quantity;
  rejection_reason: string;
  unit_cost: Money;
  landed_unit_cost: Money;
}

/**
 * Like returns, a receipt is booked against its purchase order, so the API is
 * list/retrieve only.
 */
export interface GoodsReceipt {
  id: UUID;
  receipt_number: string;
  purchase_order: UUID;
  order_number: string;
  supplier_name: string;
  warehouse: UUID;
  receipt_date: string;
  delivery_note_number: string;
  received_by_name: string;
  quality_checked: boolean;
  quality_notes: string;
  notes: string;
  lines: GoodsReceiptLine[];
  created_at: string;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface Notification {
  id: number;
  code: string;
  code_display: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  body: string;
  link: string;
  read_at: string | null;
  is_read: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface UserSession {
  id: UUID;
  ip_address: string | null;
  user_agent: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Payables: supplier invoices and payments
// ---------------------------------------------------------------------------

export interface SupplierPaymentAllocation {
  id: number;
  payment: UUID;
  payment_reference: string;
  payment_date: string;
  payment_method: string;
  supplier_invoice: UUID;
  invoice_number: string;
  invoice_reference: string;
  amount: Money;
  is_reversed: boolean;
  created_at: string;
}

export interface SupplierInvoiceListItem {
  id: UUID;
  reference: string;
  invoice_number: string;
  status: string;
  supplier: UUID;
  supplier_name: string;
  purchase_order: UUID | null;
  order_number: string | null;
  invoice_date: string;
  due_date: string | null;
  total_amount: Money;
  paid_amount: Money;
  balance_due: Money;
  /** Percentage settled, 0-100. Computed server-side so the bar matches the books. */
  payment_progress: string;
  is_overdue: boolean;
  days_overdue: number;
  currency: string;
}

export interface SupplierInvoice extends SupplierInvoiceListItem {
  supplier_code: string;
  received_date: string | null;
  subtotal: Money;
  tax_amount: Money;
  freight_cost: Money;
  customs_duty: Money;
  other_charges: Money;
  exchange_rate: string;
  is_open: boolean;
  is_cancelled: boolean;
  notes: string;
  cancelled_at: string | null;
  cancellation_reason: string;
  payment_allocations: SupplierPaymentAllocation[];
  created_at: string;
  updated_at: string;
}

export interface SupplierPaymentListItem {
  id: UUID;
  reference: string;
  supplier: UUID;
  supplier_name: string;
  payment_date: string;
  amount: Money;
  allocated_amount: Money;
  unallocated_amount: Money;
  method: string;
  payment_reference: string;
  bank_reference: string;
  is_reversed: boolean;
}

export interface SupplierPayment extends SupplierPaymentListItem {
  supplier_code: string;
  bank_account: string;
  paid_by: UUID | null;
  paid_by_name: string;
  notes: string;
  reversed_at: string | null;
  reversal_reason: string;
  allocations: SupplierPaymentAllocation[];
  created_at: string;
  updated_at: string;
}

export interface SupplierBalance {
  supplier_id: UUID;
  supplier_code: string;
  supplier_name: string;
  currency: string;
  invoice_count: number;
  total_invoiced: Money;
  total_paid: Money;
  outstanding_balance: Money;
  overdue_amount: Money;
  oldest_due_date: string | null;
}

// ---------------------------------------------------------------------------
// Accounting
// ---------------------------------------------------------------------------

export interface ExpenseCategory {
  id: UUID;
  code: string;
  // `name`/`description` are resolved read-only values for the active
  // language; the paired columns behind them are what a client writes.
  name: string;
  name_fr: string;
  name_en: string;
  description: string;
  description_fr: string;
  description_en: string;
  is_active: boolean;
  expense_count: number;
}

export interface ExpenseListItem {
  id: UUID;
  reference: string;
  status: string;
  category: UUID;
  category_code: string;
  category_name: string;
  description: string;
  expense_date: string;
  paid_date: string | null;
  amount: Money;
  currency: string;
  payment_method: string;
  payee: string;
}

export interface Expense extends ExpenseListItem {
  notes: string;
  tax_amount: Money;
  net_amount: Money;
  payment_reference: string;
  supplier: UUID | null;
  supplier_name: string | null;
  purchase_order: UUID | null;
  order_number: string | null;
  receipt_number: string;
  recorded_by: UUID | null;
  recorded_by_name: string;
  approved_by: UUID | null;
  approved_by_name: string;
  approved_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string;
  is_editable: boolean;
  is_paid: boolean;
  created_at: string;
  updated_at: string;
}

export interface FinancialOverview {
  date_from: string;
  date_to: string;
  currency: string;
  sales_count: number;
  gross_revenue: Money;
  sales_tax: Money;
  net_revenue: Money;
  cost_of_goods: Money;
  gross_profit: Money;
  gross_margin_percent: string;
  operating_expenses: Money;
  supplier_payments: Money;
  total_cash_outflow: Money;
  unpaid_expenses: Money;
  operating_result: Money;
  operating_margin_percent: string;
  outstanding_payables: Money;
  supplier_count_owed: number;
}

export interface ExpenseCategoryReportRow {
  category_id: UUID;
  category_code: string;
  category_name: string;
  category_name_en: string;
  expense_count: number;
  total_amount: Money;
  total_tax: Money;
  percentage: string;
}

export interface ExpenseCategoryReport {
  date_from: string | null;
  date_to: string | null;
  total_amount: Money;
  expense_count: number;
  category_count: number;
  categories: ExpenseCategoryReportRow[];
}

export interface SupplierPaymentReport {
  date_from: string | null;
  date_to: string | null;
  total_paid: Money;
  total_allocated: Money;
  total_unallocated: Money;
  payment_count: number;
  reversed_count: number;
  suppliers: {
    supplier_id: UUID;
    supplier_code: string;
    supplier_name: string;
    payment_count: number;
    total_paid: Money;
    total_allocated: Money;
  }[];
  methods: { method: string; payment_count: number; total_paid: Money }[];
}

export interface OutstandingBalancesReport {
  as_of: string;
  total_outstanding: Money;
  supplier_count: number;
  invoice_count: number;
  ageing: {
    current: Money;
    days_1_30: Money;
    days_31_60: Money;
    days_61_90: Money;
    days_over_90: Money;
  };
  suppliers: {
    supplier_id: UUID;
    supplier_code: string;
    supplier_name: string;
    currency: string;
    invoice_count: number;
    outstanding_balance: Money;
    overdue_amount: Money;
    oldest_due_date: string | null;
    invoices: {
      id: UUID;
      reference: string;
      invoice_number: string;
      invoice_date: string;
      due_date: string | null;
      total_amount: Money;
      paid_amount: Money;
      balance_due: Money;
      days_overdue: number;
      payment_progress: string;
    }[];
  }[];
}

export interface CashOutflowReport {
  date_from: string;
  date_to: string;
  total_outflow: Money;
  supplier_payments_total: Money;
  supplier_payment_count: number;
  expenses_total: Money;
  expense_count: number;
  unpaid_expenses_total: Money;
  expenses_by_category: {
    category_code: string;
    category_name: string;
    expense_count: number;
    total_amount: Money;
  }[];
  breakdown: { source: string; total_amount: Money }[];
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: number;
  uuid: UUID;
  timestamp: string;
  actor_username: string;
  actor_role: string;
  action: string;
  action_display: string;
  entity_type: string;
  entity_id: string;
  entity_label: string;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  changed_fields: string[];
  ip_address: string | null;
  notes: string;
}
