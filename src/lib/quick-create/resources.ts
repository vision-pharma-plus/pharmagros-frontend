"use client";

/**
 * Registry of reference records that can be created inline from a form that
 * depends on them.
 *
 * The problem this solves: a product cannot be saved without a category, a
 * unit and — in practice — a manufacturer, but until now the only way to add
 * a missing one was to abandon a half-filled form, go to another screen and
 * start over. That is the single most common way unsaved work was lost in
 * this application.
 *
 * Describing each resource once, here, is what keeps the behaviour consistent.
 * A screen does not decide what a category dialog looks like, which permission
 * guards it, or how a duplicate code is reported — it names the resource and
 * gets the same dialog, the same validation and the same permission rule as
 * every other screen. Adding a newly creatable dependency is an entry in this
 * file, not another bespoke dialog.
 */

import type { Dictionary } from "@/lib/i18n/dictionaries";

/** The shape every reference record shares once created. */
export interface ReferenceRecord {
  id: string;
  [key: string]: unknown;
}

export type FieldKind =
  | "text"
  | "textarea"
  | "email"
  | "url"
  | "tel"
  | "number"
  | "checkbox"
  /** A fixed choice list defined by the backend's `TextChoices`. */
  | "select"
  /** A nested reference — rendered as a picker over `optionsPath`. */
  | "reference";

export interface QuickCreateField {
  /** Payload key sent to the API; also the key used to map server errors. */
  name: string;
  kind: FieldKind;
  label: (t: Dictionary) => string;
  hint?: (t: Dictionary) => string;
  required?: boolean;
  placeholder?: (t: Dictionary) => string;
  /** Initial value. Defaults to "" for text kinds and false for checkboxes. */
  defaultValue?: string | boolean;
  /**
   * Uppercase as the user types. Codes are compared case-sensitively by the
   * unique constraint, so normalising here prevents "PARA" and "para" from
   * being accepted as two different categories.
   */
  uppercase?: boolean;
  /** For `kind: "number"`. */
  min?: number;
  step?: string;
  /** For `kind: "select"` — the fixed choices, keyed by the stored value. */
  choices?: (t: Dictionary) => Record<string, string>;
  /** For `kind: "reference"` — the list endpoint to choose from. */
  optionsPath?: string;
  /** Label for an option of a `reference` field. */
  optionLabel?: (item: ReferenceRecord) => string;
  /** Placeholder option meaning "no value", for optional references. */
  emptyLabel?: (t: Dictionary) => string;
  /**
   * Copy this field's value from another when the user has not typed one.
   * Used for the FR/EN name pairs: a user who fills only French should not be
   * blocked by a required English name they have no translation for.
   */
  mirrorFrom?: string;
  /**
   * Leave the key out of the payload entirely when blank, rather than sending
   * "". For a column that is non-nullable with a database default, an empty
   * string is a validation error whereas an absent key takes the default.
   */
  omitWhenBlank?: boolean;
}

export interface QuickCreateResource {
  /** Collection endpoint — POSTed to on create. */
  path: string;
  /** Permission required to create. Checked client-side for affordances only. */
  permission: string;
  /** Dialog title. */
  title: (t: Dictionary) => string;
  /** Label for the trigger button, e.g. "New category". */
  triggerLabel: (t: Dictionary) => string;
  fields: QuickCreateField[];
  /**
   * How the created record reads back in the parent control, and in the
   * confirmation toast.
   */
  getLabel: (item: ReferenceRecord) => string;
  /**
   * Fields whose uniqueness the server enforces. Used to search for an
   * existing match before POSTing, so the user is offered the record that
   * already exists instead of a 400.
   */
  uniqueFields?: string[];
  /** Extra params applied when listing options for this resource. */
  listParams?: Record<string, string | number | boolean>;
}

const str = (item: ReferenceRecord, key: string): string => {
  const value = item[key];
  return typeof value === "string" ? value : "";
};

/** `CODE — Name`, the convention already used across the option lists. */
const codeAndName = (item: ReferenceRecord): string => {
  const code = str(item, "code");
  const name = str(item, "name") || str(item, "name_fr");
  return code && name ? `${code} - ${name}` : code || name;
};

export const QUICK_CREATE_RESOURCES = {
  category: {
    path: "/catalog/categories/",
    permission: "catalog.manage_categories",
    title: (t) => t.catalog.newCategory,
    triggerLabel: (t) => t.catalog.newCategory,
    getLabel: codeAndName,
    uniqueFields: ["code"],
    listParams: { page_size: 200 },
    fields: [
      {
        name: "code",
        kind: "text",
        label: (t) => t.catalog.code,
        required: true,
        uppercase: true,
      },
      {
        name: "name_fr",
        kind: "text",
        label: (t) => `${t.catalog.name} (FR)`,
        required: true,
      },
      {
        name: "name_en",
        kind: "text",
        label: (t) => `${t.catalog.name} (EN)`,
        // Not required: mirrored from the French name when left blank, which
        // is what the backend's own translation fallback does anyway.
        mirrorFrom: "name_fr",
      },
      {
        name: "parent",
        kind: "reference",
        label: (t) => t.catalog.parentCategory,
        optionsPath: "/catalog/categories/",
        optionLabel: (item) => str(item, "name") || codeAndName(item),
        emptyLabel: (t) => t.catalog.noParent,
      },
      {
        name: "description",
        kind: "textarea",
        label: (t) => t.catalog.description,
      },
    ],
  },

  manufacturer: {
    path: "/catalog/manufacturers/",
    permission: "catalog.manage_manufacturers",
    title: (t) => t.catalog.newManufacturer,
    triggerLabel: (t) => t.catalog.newManufacturer,
    getLabel: (item) => str(item, "name") || codeAndName(item),
    uniqueFields: ["code"],
    listParams: { page_size: 200 },
    fields: [
      {
        name: "code",
        kind: "text",
        label: (t) => t.catalog.code,
        required: true,
        uppercase: true,
      },
      {
        name: "name",
        kind: "text",
        label: (t) => t.catalog.name,
        required: true,
      },
      { name: "country", kind: "text", label: (t) => t.partners.country },
      {
        name: "contact_email",
        kind: "email",
        label: (t) => t.catalog.contactEmail,
      },
      {
        name: "contact_phone",
        kind: "tel",
        label: (t) => t.catalog.contactPhone,
      },
      {
        name: "website",
        kind: "url",
        label: (t) => t.catalog.website,
        placeholder: () => "https://",
      },
    ],
  },

  unitOfMeasure: {
    path: "/catalog/units/",
    // Units are administered alongside categories server-side; mirroring that
    // here keeps the button visible to exactly the users who can use it.
    permission: "catalog.manage_categories",
    title: (t) => t.catalog.newUnit,
    triggerLabel: (t) => t.catalog.newUnit,
    getLabel: codeAndName,
    uniqueFields: ["code"],
    listParams: { page_size: 200 },
    fields: [
      {
        name: "code",
        kind: "text",
        label: (t) => t.catalog.code,
        required: true,
        uppercase: true,
        placeholder: () => "BOX",
      },
      {
        name: "name_fr",
        kind: "text",
        label: (t) => `${t.catalog.name} (FR)`,
        required: true,
      },
      {
        name: "name_en",
        kind: "text",
        label: (t) => `${t.catalog.name} (EN)`,
        mirrorFrom: "name_fr",
      },
      {
        name: "base_unit",
        kind: "reference",
        label: (t) => t.catalog.baseUnit,
        optionsPath: "/catalog/units/",
        optionLabel: codeAndName,
        emptyLabel: (t) => t.common.none,
        hint: (t) => t.catalog.baseUnitHint,
      },
      {
        name: "units_per_pack",
        kind: "number",
        label: (t) => t.catalog.unitsPerPack,
        defaultValue: "1",
        min: 0,
        step: "0.001",
      },
    ],
  },

  warehouse: {
    path: "/inventory/warehouses/",
    permission: "inventory.manage_warehouse",
    title: (t) => t.inventory.newWarehouse,
    triggerLabel: (t) => t.inventory.newWarehouse,
    getLabel: codeAndName,
    uniqueFields: ["code"],
    listParams: { page_size: 200 },
    fields: [
      {
        name: "code",
        kind: "text",
        label: (t) => t.inventory.warehouseCode,
        required: true,
        uppercase: true,
      },
      // A warehouse name is a translated pair like a category's, not a single
      // `name` column — `name` itself is read-only and resolved per language.
      {
        name: "name_fr",
        kind: "text",
        label: (t) => `${t.catalog.name} (FR)`,
        required: true,
      },
      {
        name: "name_en",
        kind: "text",
        label: (t) => `${t.catalog.name} (EN)`,
        mirrorFrom: "name_fr",
      },
      { name: "address", kind: "text", label: (t) => t.partners.address },
      {
        name: "city",
        kind: "text",
        label: (t) => t.partners.city,
        // The column carries a default but the serializer rejects "", so the
        // field is omitted rather than blanked — see `omitWhenBlank`.
        omitWhenBlank: true,
      },
      {
        name: "is_cold_chain",
        kind: "checkbox",
        label: (t) => t.inventory.isColdChain,
        defaultValue: false,
      },
      // `is_default` is deliberately absent: promoting a warehouse to the
      // system default is a consequential change that shifts where every
      // future sale draws stock from, and is not something to do in passing
      // from another form. It stays on the warehouses screen.
    ],
  },

  /**
   * A catalogue product, created from the line of a receipt.
   *
   * The case this exists for: a delivery contains something the pharmacy has
   * never stocked. Sending the clerk to the catalogue screen to create it
   * abandons a half-entered delivery, so the product is created here and
   * returned selected into the line they were already filling.
   *
   * Deliberately no batch fields. The lot and expiry are being typed on the
   * receipt line beside this dialog, where they belong -- asking for them
   * twice is how a product ends up with a lot code that contradicts the one
   * actually booked into stock.
   */
  medicine: {
    path: "/catalog/medicines/",
    permission: "catalog.add_medicine",
    title: (t) => t.nav.newMedicine,
    triggerLabel: (t) => t.nav.newMedicine,
    getLabel: (item) => str(item, "display_name") || str(item, "name"),
    listParams: { page_size: 50 },
    fields: [
      {
        name: "name",
        kind: "text",
        label: (t) => t.catalog.name,
        required: true,
      },
      {
        name: "category",
        kind: "reference",
        label: (t) => t.catalog.category,
        optionsPath: "/catalog/categories/",
        optionLabel: (item) => str(item, "name") || codeAndName(item),
        required: true,
      },
      {
        name: "unit_of_measure",
        kind: "reference",
        label: (t) => t.catalog.unitOfMeasure,
        optionsPath: "/catalog/units/",
        optionLabel: codeAndName,
        required: true,
      },
      {
        name: "dosage_form",
        kind: "select",
        label: (t) => t.catalog.dosageForm,
        choices: (t) => t.dosageForms,
        defaultValue: "TABLET",
        required: true,
      },
      {
        name: "strength",
        kind: "text",
        label: (t) => t.catalog.strength,
        placeholder: () => "500mg",
      },
      {
        name: "unit_cost",
        kind: "number",
        label: (t) => t.catalog.unitCost,
        hint: (t) => t.catalog.quickCreateCostHint,
        required: true,
        min: 0,
        step: "0.0001",
        defaultValue: "0",
      },
      {
        name: "selling_price",
        kind: "number",
        label: (t) => t.catalog.sellingPrice,
        required: true,
        min: 0,
        step: "0.0001",
        defaultValue: "0",
      },
      {
        name: "manufacturer",
        kind: "reference",
        label: (t) => t.catalog.manufacturer,
        optionsPath: "/catalog/manufacturers/",
        optionLabel: (item) => str(item, "name") || codeAndName(item),
        emptyLabel: (t) => t.common.none,
      },
    ],
  },

  supplier: {
    path: "/partners/suppliers/",
    permission: "partners.add_supplier",
    title: (t) => t.partners.newSupplier,
    triggerLabel: (t) => t.partners.newSupplier,
    getLabel: (item) => str(item, "name"),
    listParams: { page_size: 200 },
    fields: [
      {
        name: "name",
        kind: "text",
        label: (t) => t.partners.businessName,
        required: true,
      },
      {
        name: "nif",
        kind: "text",
        label: (t) => t.partners.nif,
        uppercase: true,
      },
      {
        name: "contact_person",
        kind: "text",
        label: (t) => t.partners.contactPerson,
      },
      { name: "email", kind: "email", label: (t) => t.partners.email },
      { name: "phone", kind: "tel", label: (t) => t.partners.phone },
      { name: "city", kind: "text", label: (t) => t.partners.city },
      { name: "country", kind: "text", label: (t) => t.partners.country },
    ],
  },

  customer: {
    path: "/partners/customers/",
    permission: "partners.add_customer",
    title: (t) => t.nav.newCustomer,
    triggerLabel: (t) => t.nav.newCustomer,
    getLabel: (item) => str(item, "business_name"),
    fields: [
      {
        name: "business_name",
        kind: "text",
        label: (t) => t.partners.businessName,
        required: true,
      },
      {
        name: "customer_type",
        kind: "select",
        label: (t) => t.partners.customerType,
        choices: (t) => t.customerTypes,
        defaultValue: "PHARMACY",
        required: true,
      },
      {
        name: "nif",
        kind: "text",
        label: (t) => t.partners.nif,
        uppercase: true,
      },
      {
        name: "contact_person",
        kind: "text",
        label: (t) => t.partners.contactPerson,
      },
      { name: "email", kind: "email", label: (t) => t.partners.email },
      { name: "phone", kind: "tel", label: (t) => t.partners.phone },
      {
        name: "city",
        kind: "text",
        label: (t) => t.partners.city,
        omitWhenBlank: true,
      },
    ],
  },
} satisfies Record<string, QuickCreateResource>;

export type QuickCreateResourceKey = keyof typeof QUICK_CREATE_RESOURCES;

export function getResource(key: QuickCreateResourceKey): QuickCreateResource {
  return QUICK_CREATE_RESOURCES[key];
}

/** Initial form state for a resource, honouring per-field defaults. */
export function initialValues(
  resource: QuickCreateResource,
): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {};
  for (const field of resource.fields) {
    values[field.name] =
      field.defaultValue ?? (field.kind === "checkbox" ? false : "");
  }
  return values;
}

/**
 * Turn form state into an API payload.
 *
 * Blank optional references become `null` rather than `""` — DRF rejects an
 * empty string for a FK — and mirrored names are filled in.
 */
export function buildPayload(
  resource: QuickCreateResource,
  values: Record<string, string | boolean>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const field of resource.fields) {
    const raw = values[field.name];

    if (field.kind === "checkbox") {
      payload[field.name] = Boolean(raw);
      continue;
    }

    let value = typeof raw === "string" ? raw.trim() : "";

    if (!value && field.mirrorFrom) {
      const source = values[field.mirrorFrom];
      value = typeof source === "string" ? source.trim() : "";
    }

    if (field.kind === "reference") {
      payload[field.name] = value || null;
      continue;
    }

    // Absent, so the column's own default applies. Sending "" would be
    // rejected outright for a non-nullable field.
    if (!value && field.omitWhenBlank) continue;

    payload[field.name] = value;
  }

  return payload;
}

/** Fields the user must fill before the dialog will submit. */
export function missingRequired(
  resource: QuickCreateResource,
  values: Record<string, string | boolean>,
): string[] {
  return resource.fields
    .filter((field) => {
      if (!field.required) return false;
      const value = values[field.name];
      return typeof value === "string" ? value.trim() === "" : !value;
    })
    .map((field) => field.name);
}
