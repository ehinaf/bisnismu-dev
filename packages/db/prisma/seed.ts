import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as argon2 from "argon2";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const SEED_BUSINESS_NAME = "Warung Makan Sederhana";

async function main() {
  const existing = await prisma.business.findFirst({
    where: { name: SEED_BUSINESS_NAME },
  });
  if (existing) {
    console.log(`Seed dilewati: business "${SEED_BUSINESS_NAME}" sudah ada (id=${existing.id}).`);
    return;
  }

  const [ownerPassword, managerPassword, cashierPassword, cashierPin] = await Promise.all([
    argon2.hash("Owner123!", { type: argon2.argon2id }),
    argon2.hash("Manager123!", { type: argon2.argon2id }),
    argon2.hash("Cashier123!", { type: argon2.argon2id }),
    argon2.hash("1234", { type: argon2.argon2id }),
  ]);

  const business = await prisma.business.create({
    data: {
      name: SEED_BUSINESS_NAME,
      business_type: "fnb",
      email: "warung.sederhana@example.com",
      phone: "081234567890",
      address: "Jl. Merdeka No. 10, Jakarta",
    },
  });

  await prisma.businessSetting.create({
    data: {
      business_id: business.id,
      enable_tables: true,
      receipt_via_whatsapp: true,
    },
  });

  const outlet = await prisma.outlet.create({
    data: {
      business_id: business.id,
      name: "Cabang Utama",
      address: "Jl. Merdeka No. 10, Jakarta",
      phone: "081234567890",
    },
  });

  const [owner, manager, cashier] = await Promise.all([
    prisma.user.create({
      data: {
        business_id: business.id,
        name: "Budi Pemilik",
        email: "owner@bisnismu.test",
        password_hash: ownerPassword,
        role: "owner",
      },
    }),
    prisma.user.create({
      data: {
        business_id: business.id,
        name: "Ani Manajer",
        email: "manager@bisnismu.test",
        password_hash: managerPassword,
        role: "manager",
      },
    }),
    prisma.user.create({
      data: {
        business_id: business.id,
        name: "Citra Kasir",
        email: "cashier@bisnismu.test",
        password_hash: cashierPassword,
        pin_code: cashierPin,
        role: "cashier",
      },
    }),
  ]);

  await prisma.userOutlet.createMany({
    data: [owner, manager, cashier].map((user) => ({
      user_id: user.id,
      outlet_id: outlet.id,
    })),
  });

  const [kategoriMakanan, kategoriMinuman] = await Promise.all([
    prisma.category.create({ data: { business_id: business.id, name: "Makanan", sort_order: 1 } }),
    prisma.category.create({ data: { business_id: business.id, name: "Minuman", sort_order: 2 } }),
  ]);

  const unitPorsi = await prisma.unit.create({
    data: { business_id: business.id, name: "Porsi", symbol: "porsi" },
  });

  const products: {
    name: string;
    category_id: string;
    base_price: number;
    cost_price: number;
  }[] = [
    { name: "Nasi Goreng", category_id: kategoriMakanan.id, base_price: 20000, cost_price: 11000 },
    { name: "Mie Goreng", category_id: kategoriMakanan.id, base_price: 18000, cost_price: 10000 },
    { name: "Ayam Goreng", category_id: kategoriMakanan.id, base_price: 15000, cost_price: 8500 },
    { name: "Sate Ayam", category_id: kategoriMakanan.id, base_price: 25000, cost_price: 14000 },
    { name: "Gado-Gado", category_id: kategoriMakanan.id, base_price: 17000, cost_price: 9000 },
    { name: "Es Teh Manis", category_id: kategoriMinuman.id, base_price: 5000, cost_price: 1500 },
    { name: "Es Jeruk", category_id: kategoriMinuman.id, base_price: 6000, cost_price: 2000 },
    { name: "Kopi Hitam", category_id: kategoriMinuman.id, base_price: 8000, cost_price: 3000 },
    { name: "Jus Alpukat", category_id: kategoriMinuman.id, base_price: 12000, cost_price: 5500 },
    { name: "Air Mineral", category_id: kategoriMinuman.id, base_price: 4000, cost_price: 1800 },
  ];

  const items = await Promise.all(
    products.map((product, index) =>
      prisma.item.create({
        data: {
          business_id: business.id,
          category_id: product.category_id,
          unit_id: unitPorsi.id,
          sku: `SKU-${String(index + 1).padStart(3, "0")}`,
          name: product.name,
          base_price: product.base_price,
          cost_price: product.cost_price,
        },
      }),
    ),
  );

  await prisma.inventory.createMany({
    data: items.map((item) => ({
      outlet_id: outlet.id,
      item_id: item.id,
      quantity_on_hand: 50,
      reorder_level: 10,
      avg_cost: item.cost_price,
    })),
  });

  console.log("Seed selesai:");
  console.log(`  Business : ${business.name} (${business.id})`);
  console.log(`  Outlet   : ${outlet.name} (${outlet.id})`);
  console.log(`  Users    : owner@bisnismu.test / Owner123!`);
  console.log(`             manager@bisnismu.test / Manager123!`);
  console.log(`             cashier@bisnismu.test / Cashier123! (PIN: 1234)`);
  console.log(`  Produk   : ${items.length} item (5 makanan, 5 minuman), stok awal 50/outlet`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
