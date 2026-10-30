export const categories = [
    { slug: "furniture", title: "Furniture", description: "Tables, chairs and benches." },
    { slug: "vessels", title: "Vessels & Containers", description: "Barrels, tankards and other vessels." },
    { slug: "weapons", title: "Weapons & Armor", description: "Weapons and protective gear." },
    { slug: "tools", title: "Tools", description: "Tools and workshop equipment." },
    { slug: "materials", title: "Materials & Components", description: "Parts and raw materials." }
] as const;

export type ModelCategory = (typeof categories)[number];
export type ModelCategorySlug = ModelCategory["slug"];
