// Generic, fictional sample data that runs on both SQLite and PostgreSQL.
export const EXAMPLE_SESSION = {
  engine: 'sqlite',
  schemaSql: `CREATE TABLE students (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  year INTEGER
);

CREATE TABLE courses (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  credits INTEGER NOT NULL
);

CREATE TABLE enrollments (
  student_id INTEGER NOT NULL REFERENCES students (id),
  course_id INTEGER NOT NULL REFERENCES courses (id),
  grade INTEGER
);

INSERT INTO students (id, name, year) VALUES
  (1, 'Ada Example', 2),
  (2, 'Sam Sample', 1),
  (3, 'Robin Placeholder', NULL);

INSERT INTO courses (id, title, credits) VALUES
  (1, 'Intro to Databases', 6),
  (2, 'Data Structures', 5),
  (3, 'Statistics', 4);

INSERT INTO enrollments (student_id, course_id, grade) VALUES
  (1, 1, 90),
  (1, 2, 85),
  (2, 1, 72),
  (2, 3, NULL);`,
  querySql: `SELECT students.name, courses.title, enrollments.grade
FROM enrollments
JOIN students ON students.id = enrollments.student_id
JOIN courses ON courses.id = enrollments.course_id
ORDER BY students.name, courses.title;`,
};
