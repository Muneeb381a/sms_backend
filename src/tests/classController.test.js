const { pool } = require("../config/db");
const logger = require("../services/logger");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const {
  getAllClasses,
  createClasses,
  updateClasses,
  getClassById,
  deleteClass,
} = require("../controllers/classes_controller");
const { newDb } = require("pg-mem");
const supertest = require("supertest");
const express = require("express");

// Mock logger to prevent actual logging during tests
jest.mock("../services/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

// Setup in-memory database
const db = newDb();
const poolMock = db.adapters.createPg();

describe("Class Controller Tests", () => {
  let app, request;

  beforeAll(async () => {
    // Create tables in pg-mem
    await poolMock.query(`
      CREATE TABLE classes (
        id SERIAL PRIMARY KEY,
        class_name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        version INTEGER DEFAULT 0,
        UNIQUE(class_name)
      );
    `);
    await poolMock.query(`
      CREATE TABLE sections (
        id SERIAL PRIMARY KEY,
        class_id INTEGER REFERENCES classes(id),
        section_name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(class_id, section_name)
      );
    `);

    // Mock pool to use pg-mem
    jest.spyOn(pool, "connect").mockImplementation(() => {
      const client = {
        query: poolMock.query.bind(poolMock),
        release: jest.fn(),
      };
      return Promise.resolve(client);
    });

    // Setup Express app for integration tests
    app = express();
    app.use(express.json());
    app.get("/api/v1/classes", getAllClasses);
    app.post("/api/v1/classes", createClasses);
    app.put("/api/v1/classes/:id", updateClasses);
    app.get("/api/v1/classes/:id", getClassById);
    app.delete("/api/v1/classes/:id", deleteClass);
    request = supertest(app);
  });

  afterEach(async () => {
    // Clear tables after each test
    await poolMock.query("TRUNCATE classes, sections RESTART IDENTITY CASCADE");
    jest.clearAllMocks();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
  });

  describe("Unit Tests", () => {
    describe("createClasses", () => {
      it("should reject missing class_name", async () => {
        const req = { body: {} };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        await createClasses(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        expect(next.mock.calls[0][0]).toMatchObject({
          status: 400,
          message: "class_name cannot be empty",
        });
      });

      it("should reject invalid sections", async () => {
        const req = { body: { class_name: "Math", sections: ["", "A"] } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        await createClasses(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        expect(next.mock.calls[0][0]).toMatchObject({
          status: 400,
          message: "sections[0] must be a non-empty string",
        });
      });
    });

    describe("updateClasses", () => {
      it("should reject invalid ID", async () => {
        const req = { params: { id: "invalid" }, body: { class_name: "Math" } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        await updateClasses(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        expect(next.mock.calls[0][0]).toMatchObject({
          status: 400,
          message: "Invalid class ID",
        });
      });

      it("should reject missing update fields", async () => {
        const req = { params: { id: "1" }, body: {} };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        await updateClasses(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        expect(next.mock.calls[0][0]).toMatchObject({
          status: 400,
          message:
            "At least one of class_name, sections, or sections_to_delete is required",
        });
      });

      it("should accept string version", async () => {
        // Insert a class
        await poolMock.query(
          "INSERT INTO classes (class_name, version) VALUES ('Math', 0)"
        );

        const req = {
          params: { id: "1" },
          body: { class_name: "Math Updated", version: "0" },
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        await updateClasses(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 200,
            message: "Class updated successfully",
            data: expect.objectContaining({
              class_name: "Math Updated",
              version: 1,
            }),
          })
        );
      });
    });
  });

  describe("Integration Tests", () => {
    describe("GET /api/v1/classes", () => {
      it("should return empty array when no classes exist", async () => {
        const response = await request.get("/api/v1/classes?page=1&limit=10");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          status: 200,
          message: "No classes found",
          data: [],
          meta: expect.objectContaining({ page: 1, limit: 10 }),
        });
      });

      it("should return paginated classes", async () => {
        await poolMock.query(
          "INSERT INTO classes (class_name, version) VALUES ('Math', 0)"
        );
        await poolMock.query(
          "INSERT INTO sections (class_id, section_name) VALUES (1, 'A')"
        );

        const response = await request.get("/api/v1/classes?page=1&limit=10");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          status: 200,
          message: "Classes retrieved successfully",
          data: [
            expect.objectContaining({
              id: 1,
              class_name: "Math",
              version: 0,
              sections: [expect.objectContaining({ section_name: "A" })],
            }),
          ],
          meta: expect.objectContaining({ page: 1, limit: 10 }),
        });
      });
    });

    describe("POST /api/v1/classes", () => {
      it("should create a class with sections", async () => {
        const response = await request.post("/api/v1/classes").send({
          class_name: "Math",
          sections: ["A", "B"],
        });

        expect(response.status).toBe(201);
        expect(response.body).toEqual({
          status: 201,
          message: "Class created successfully",
          data: expect.objectContaining({
            id: 1,
            class_name: "Math",
            version: 0,
            sections: [
              expect.objectContaining({ section_name: "A" }),
              expect.objectContaining({ section_name: "B" }),
            ],
          }),
          meta: expect.any(Object),
        });
      });

      it("should reject duplicate class_name", async () => {
        await poolMock.query(
          "INSERT INTO classes (class_name, version) VALUES ('Math', 0)"
        );
        const response = await request.post("/api/v1/classes").send({
          class_name: "Math",
          sections: ["A"],
        });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
          status: 409,
          message: "A class or section with this name already exists",
          error: expect.any(String),
        });
      });
    });

    describe("PUT /api/v1/classes/:id", () => {
      it("should update class without version", async () => {
        await poolMock.query(
          "INSERT INTO classes (class_name, version) VALUES ('Math', 0)"
        );
        const response = await request.put("/api/v1/classes/1").send({
          class_name: "Math Updated",
          sections: ["A"],
        });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          status: 200,
          message: "Class updated successfully",
          data: expect.objectContaining({
            id: 1,
            class_name: "Math Updated",
            version: 1,
            sections: [expect.objectContaining({ section_name: "A" })],
          }),
          meta: expect.any(Object),
        });
      });

      it("should handle version conflict", async () => {
        await poolMock.query(
          "INSERT INTO classes (class_name, version) VALUES ('Math', 0)"
        );
        const response = await request.put("/api/v1/classes/1").send({
          class_name: "Math Updated",
          version: 1, // Incorrect version
        });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
          status: 409,
          message: "Version conflict: expected 0, received 1",
          error: expect.any(String),
        });
      });

      it("should update with correct version", async () => {
        await poolMock.query(
          "INSERT INTO classes (class_name, version) VALUES ('Math', 0)"
        );
        const response = await request.put("/api/v1/classes/1").send({
          class_name: "Math Updated",
          version: 0,
        });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          status: 200,
          message: "Class updated successfully",
          data: expect.objectContaining({
            id: 1,
            class_name: "Math Updated",
            version: 1,
          }),
          meta: expect.any(Object),
        });
      });
    });

    describe("GET /api/v1/classes/:id", () => {
      it("should return 404 for non-existent class", async () => {
        const response = await request.get("/api/v1/classes/1");

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
          status: 404,
          message: "Class not found",
          error: expect.any(String),
        });
      });

      it("should return class details", async () => {
        await poolMock.query(
          "INSERT INTO classes (class_name, version) VALUES ('Math', 0)"
        );
        const response = await request.get("/api/v1/classes/1");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          status: 200,
          message: "Class retrieved successfully",
          data: expect.objectContaining({
            id: 1,
            class_name: "Math",
            version: 0,
            sections: [],
          }),
          meta: expect.any(Object),
        });
      });
    });

    describe("DELETE /api/v1/classes/:id", () => {
      it("should delete a class and its sections", async () => {
        await poolMock.query(
          "INSERT INTO classes (class_name, version) VALUES ('Math', 0)"
        );
        await poolMock.query(
          "INSERT INTO sections (class_id, section_name) VALUES (1, 'A')"
        );
        const response = await request.delete("/api/v1/classes/1");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          status: 200,
          message: "Class deleted successfully",
          data: expect.objectContaining({
            id: 1,
            class_name: "Math",
          }),
          meta: expect.any(Object),
        });

        // Verify sections are deleted
        const sections = await poolMock.query(
          "SELECT * FROM sections WHERE class_id = 1"
        );
        expect(sections.rows).toHaveLength(0);
      });

      it("should return 404 for non-existent class", async () => {
        const response = await request.delete("/api/v1/classes/1");

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
          status: 404,
          message: "Class not found",
          error: expect.any(String),
        });
      });
    });
  });
});
