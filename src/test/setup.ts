import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock Next.js cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock environment variables
process.env.DATABASE_PATH = ":memory:";
