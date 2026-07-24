const STRING_FUNCTIONS = [
  ['ASCII', 'ASCII(character_expression)', "SELECT ASCII('A') AS ascii_code;", 'Returns the ASCII code value of the leftmost character.'],
  ['CHAR', 'CHAR(integer_expression)', 'SELECT CHAR(65) AS character_value;', 'Converts an integer ASCII code to a character.'],
  ['CHARINDEX', 'CHARINDEX(search_expression, expression[, start_location])', "SELECT CHARINDEX('risk', 'credit risk model') AS position;", 'Returns the starting position of a substring.'],
  ['CONCAT', 'CONCAT(value1, value2, ...)', "SELECT CONCAT('Retail', ' ', 'Risk') AS full_text;", 'Concatenates values into a single string.'],
  ['CONCAT_WS', "CONCAT_WS(separator, value1, value2, ...)", "SELECT CONCAT_WS('-', 'PF', '2026', 'APR') AS key_value;", 'Concatenates values using a separator.'],
  ['DATALENGTH', 'DATALENGTH(expression)', "SELECT DATALENGTH('Warehouse') AS bytes_len;", 'Returns the number of bytes used to represent an expression.'],
  ['DIFFERENCE', 'DIFFERENCE(character_expression, character_expression)', "SELECT DIFFERENCE('Risk', 'Rask') AS soundex_diff;", 'Compares Soundex values and returns similarity score.'],
  ['FORMAT', 'FORMAT(value, format[, culture])', "SELECT FORMAT(GETDATE(), 'yyyy-MM-dd') AS formatted_date;", 'Returns a value formatted with the specified format string.'],
  ['LEFT', 'LEFT(character_expression, integer_expression)', "SELECT LEFT('Warehouse', 5) AS left_part;", 'Returns the left part of a string.'],
  ['LEN', 'LEN(string_expression)', "SELECT LEN('Warehouse') AS text_len;", 'Returns the number of characters in a string.'],
  ['LOWER', 'LOWER(character_expression)', "SELECT LOWER('RISK') AS lower_text;", 'Converts string to lowercase.'],
  ['LTRIM', 'LTRIM(character_expression)', "SELECT LTRIM('   risk') AS trimmed_left;", 'Removes leading spaces from a string.'],
  ['NCHAR', 'NCHAR(integer_expression)', 'SELECT NCHAR(9731) AS unicode_char;', 'Returns the Unicode character specified by integer code.'],
  ['PATINDEX', 'PATINDEX(%pattern%, expression)', "SELECT PATINDEX('%risk%', 'credit risk score') AS position;", 'Returns the starting position of a pattern.'],
  ['QUOTENAME', 'QUOTENAME(character_string[, quote_character])', "SELECT QUOTENAME('customer id') AS quoted_name;", 'Returns a Unicode string with delimiters for identifiers.'],
  ['REPLACE', 'REPLACE(string_expression, string_pattern, string_replacement)', "SELECT REPLACE('risk-model', '-', '_') AS cleaned;", 'Replaces occurrences of a substring.'],
  ['REPLICATE', 'REPLICATE(string_expression, integer_expression)', "SELECT REPLICATE('*', 5) AS stars;", 'Repeats a string a specified number of times.'],
  ['REVERSE', 'REVERSE(string_expression)', "SELECT REVERSE('risk') AS reversed_text;", 'Reverses string characters.'],
  ['RIGHT', 'RIGHT(character_expression, integer_expression)', "SELECT RIGHT('Warehouse', 5) AS right_part;", 'Returns the right part of a string.'],
  ['RTRIM', 'RTRIM(character_expression)', "SELECT RTRIM('risk   ') AS trimmed_right;", 'Removes trailing spaces from a string.'],
  ['SOUNDEX', 'SOUNDEX(character_expression)', "SELECT SOUNDEX('Risk') AS soundex_code;", 'Returns the Soundex code of a string.'],
  ['SPACE', 'SPACE(integer_expression)', "SELECT 'A' + SPACE(3) + 'B' AS padded;", 'Returns a string of repeated spaces.'],
  ['STR', 'STR(float_expression[, length[, decimal]])', 'SELECT STR(123.456, 8, 2) AS str_number;', 'Converts numeric expression to character data.'],
  ['STUFF', 'STUFF(character_expression, start, length, replace_with_expression)', "SELECT STUFF('credit-risk', 7, 1, '_') AS stuffed;", 'Deletes part of a string and inserts another string.'],
  ['SUBSTRING', 'SUBSTRING(expression, start, length)', "SELECT SUBSTRING('Warehouse', 2, 4) AS sub_text;", 'Extracts part of a string from a position.'],
  ['TRANSLATE', 'TRANSLATE(inputString, characters, translations)', "SELECT TRANSLATE('abc', 'ac', 'xz') AS translated;", 'Replaces characters one-to-one from source to target set.'],
  ['TRIM', 'TRIM([characters FROM] string)', "SELECT TRIM('   risk   ') AS trimmed;", 'Removes leading and trailing spaces or characters.'],
  ['UNICODE', 'UNICODE(ncharacter_expression)', "SELECT UNICODE('A') AS unicode_code;", 'Returns Unicode integer value of first character.'],
  ['UPPER', 'UPPER(character_expression)', "SELECT UPPER('risk') AS upper_text;", 'Converts string to uppercase.'],
]

const NUMERIC_FUNCTIONS = [
  ['ABS', 'ABS(number)', 'SELECT ABS(-10) AS abs_value;', 'Returns absolute value.'],
  ['ACOS', 'ACOS(float_expression)', 'SELECT ACOS(1.0) AS acos_value;', 'Returns arccosine in radians.'],
  ['ASIN', 'ASIN(float_expression)', 'SELECT ASIN(1.0) AS asin_value;', 'Returns arcsine in radians.'],
  ['ATAN', 'ATAN(float_expression)', 'SELECT ATAN(1.0) AS atan_value;', 'Returns arctangent in radians.'],
  ['ATN2', 'ATN2(float_expression_y, float_expression_x)', 'SELECT ATN2(1.0, 1.0) AS atn2_value;', 'Returns arctangent of Y/X in radians.'],
  ['AVG', 'AVG([ALL|DISTINCT] expression)', 'SELECT AVG(financing_amount) AS avg_amount FROM pf_0326;', 'Returns average value.'],
  ['CEILING', 'CEILING(number)', 'SELECT CEILING(12.34) AS ceil_value;', 'Returns smallest integer >= expression.'],
  ['COUNT', 'COUNT(*) | COUNT(expression)', 'SELECT COUNT(*) AS total_rows FROM pf_0326;', 'Returns row count.'],
  ['COS', 'COS(float_expression)', 'SELECT COS(0) AS cos_value;', 'Returns cosine in radians.'],
  ['COT', 'COT(float_expression)', 'SELECT COT(1.0) AS cot_value;', 'Returns cotangent in radians.'],
  ['DEGREES', 'DEGREES(numeric_expression)', 'SELECT DEGREES(PI()) AS deg_value;', 'Converts radians to degrees.'],
  ['EXP', 'EXP(float_expression)', 'SELECT EXP(1.0) AS exp_value;', 'Returns e raised to expression.'],
  ['FLOOR', 'FLOOR(number)', 'SELECT FLOOR(12.99) AS floor_value;', 'Returns largest integer <= expression.'],
  ['LOG', 'LOG(float_expression[, base])', 'SELECT LOG(100.0) AS natural_log;', 'Returns natural logarithm or logarithm with base.'],
  ['LOG10', 'LOG10(float_expression)', 'SELECT LOG10(1000.0) AS log10_value;', 'Returns base-10 logarithm.'],
  ['MAX', 'MAX(expression)', 'SELECT MAX(financing_amount) AS max_amount FROM pf_0326;', 'Returns maximum value.'],
  ['MIN', 'MIN(expression)', 'SELECT MIN(financing_amount) AS min_amount FROM pf_0326;', 'Returns minimum value.'],
  ['PI', 'PI()', 'SELECT PI() AS pi_value;', 'Returns the PI constant.'],
  ['POWER', 'POWER(float_expression, y)', 'SELECT POWER(2, 10) AS power_value;', 'Returns expression raised to power y.'],
  ['RADIANS', 'RADIANS(numeric_expression)', 'SELECT RADIANS(180) AS rad_value;', 'Converts degrees to radians.'],
  ['RAND', 'RAND([seed])', 'SELECT RAND() AS random_value;', 'Returns pseudo-random float from 0 to 1.'],
  ['ROUND', 'ROUND(numeric_expression, length[, function])', 'SELECT ROUND(123.4567, 2) AS rounded;', 'Rounds numeric expression.'],
  ['SIGN', 'SIGN(numeric_expression)', 'SELECT SIGN(-100) AS sign_value;', 'Returns sign: -1, 0, or 1.'],
  ['SIN', 'SIN(float_expression)', 'SELECT SIN(PI()/2) AS sin_value;', 'Returns sine in radians.'],
  ['SQRT', 'SQRT(float_expression)', 'SELECT SQRT(81) AS sqrt_value;', 'Returns square root.'],
  ['SQUARE', 'SQUARE(float_expression)', 'SELECT SQUARE(9) AS square_value;', 'Returns square of expression.'],
  ['SUM', 'SUM([ALL|DISTINCT] expression)', 'SELECT SUM(financing_amount) AS total_amount FROM pf_0326;', 'Returns sum of values.'],
  ['TAN', 'TAN(float_expression)', 'SELECT TAN(1.0) AS tan_value;', 'Returns tangent in radians.'],
]

const DATE_FUNCTIONS = [
  ['CURRENT_TIMESTAMP', 'CURRENT_TIMESTAMP', 'SELECT CURRENT_TIMESTAMP AS now_ts;', 'Returns current date and time.'],
  ['DATEADD', 'DATEADD(datepart, number, date)', "SELECT DATEADD(day, 7, GETDATE()) AS next_week;", 'Adds interval to date.'],
  ['DATEDIFF', 'DATEDIFF(datepart, startdate, enddate)', "SELECT DATEDIFF(day, '2026-01-01', '2026-01-31') AS diff_days;", 'Returns date difference for given datepart.'],
  ['DATEFROMPARTS', 'DATEFROMPARTS(year, month, day)', 'SELECT DATEFROMPARTS(2026, 4, 29) AS built_date;', 'Builds a date from year/month/day.'],
  ['DATENAME', 'DATENAME(datepart, date)', "SELECT DATENAME(month, GETDATE()) AS month_name;", 'Returns character string for datepart.'],
  ['DATEPART', 'DATEPART(datepart, date)', 'SELECT DATEPART(year, GETDATE()) AS current_year;', 'Returns integer datepart.'],
  ['DAY', 'DAY(date)', 'SELECT DAY(GETDATE()) AS day_of_month;', 'Returns day of month.'],
  ['GETDATE', 'GETDATE()', 'SELECT GETDATE() AS current_datetime;', 'Returns current server date/time.'],
  ['GETUTCDATE', 'GETUTCDATE()', 'SELECT GETUTCDATE() AS current_utc;', 'Returns current UTC date/time.'],
  ['ISDATE', 'ISDATE(expression)', "SELECT ISDATE('2026-04-29') AS valid_date;", 'Returns whether expression can be interpreted as date.'],
  ['MONTH', 'MONTH(date)', 'SELECT MONTH(GETDATE()) AS current_month;', 'Returns month part as integer.'],
  ['SYSDATETIME', 'SYSDATETIME()', 'SELECT SYSDATETIME() AS current_sysdatetime;', 'Returns current date/time with higher precision.'],
  ['YEAR', 'YEAR(date)', 'SELECT YEAR(GETDATE()) AS current_year;', 'Returns year part as integer.'],
  ['TO_DATE', "TO_DATE(value[, format])", "SELECT TO_DATE('31/12/2024', 'DD/MM/YYYY') AS d;", 'Parses a string/serial into an ISO date. Optional Oracle-style format mask (YYYY, MM, DD, MON).'],
  ['TO_CHAR', "TO_CHAR(value, format)", "SELECT TO_CHAR(GETDATE(), 'YYYY-MM-DD') AS d;", 'Formats a date or number as text using a format mask.'],
  ['DATEADD', 'DATEADD(datepart, number, date)', "SELECT DATEADD(month, 3, '2026-01-31') AS d;", 'Adds an interval to a date.'],
  ['ADD_MONTHS', 'ADD_MONTHS(date, n)', "SELECT ADD_MONTHS('2026-01-31', 2) AS d;", 'Adds n months to a date (Oracle style).'],
  ['LAST_DAY', 'LAST_DAY(date)', "SELECT LAST_DAY('2026-02-10') AS d;", 'Returns the last day of the month for the given date.'],
  ['EOMONTH', 'EOMONTH(date[, month_offset])', "SELECT EOMONTH('2026-02-10') AS d;", 'Returns the last day of the month, with optional offset.'],
  ['MONTHNAME', 'MONTHNAME(date)', "SELECT MONTHNAME('2026-04-29') AS m;", 'Returns the full month name (e.g. April).'],
  ['DAYNAME', 'DAYNAME(date)', "SELECT DAYNAME('2026-04-29') AS d;", 'Returns the full weekday name (e.g. Wednesday).'],
  ['QUARTER', 'QUARTER(date)', "SELECT QUARTER('2026-04-29') AS q;", 'Returns the calendar quarter (1-4).'],
]

const ADVANCED_FUNCTIONS = [
  ['CAST', 'CAST(expression AS data_type)', 'SELECT CAST(financing_amount AS INT) AS amount_int FROM pf_0326 LIMIT 5;', 'Converts expression to target type.'],
  ['COALESCE', 'COALESCE(value1, value2, ...)', 'SELECT COALESCE(NULL, NULL, 10) AS first_not_null;', 'Returns first non-null expression.'],
  ['CONVERT', 'CONVERT(data_type, expression[, style])', 'SELECT CONVERT(VARCHAR, GETDATE(), 23) AS converted_date;', 'Converts expression to target type.'],
  ['CURRENT_USER', 'CURRENT_USER', 'SELECT CURRENT_USER AS current_user;', 'Returns current user name.'],
  ['IIF', 'IIF(boolean_expression, true_value, false_value)', "SELECT IIF(credit_score >= 700, 'GOOD', 'RISK') AS risk_bucket FROM customers;", 'Returns one of two values based on condition.'],
  ['ISNULL', 'ISNULL(check_expression, replacement_value)', 'SELECT ISNULL(NULL, 0) AS null_replaced;', 'Replaces NULL with replacement value.'],
  ['ISNUMERIC', 'ISNUMERIC(expression)', "SELECT ISNUMERIC('123.45') AS is_numeric;", 'Returns whether expression is a valid numeric type.'],
  ['NULLIF', 'NULLIF(expression1, expression2)', "SELECT NULLIF('A', 'A') AS null_when_equal;", 'Returns NULL when two expressions are equal.'],
  ['SESSION_USER', 'SESSION_USER', 'SELECT SESSION_USER AS session_user;', 'Returns session user.'],
  ['SESSIONPROPERTY', 'SESSIONPROPERTY(option)', "SELECT SESSIONPROPERTY('ANSI_NULLS') AS ansi_nulls;", 'Returns session-level setting value.'],
  ['SYSTEM_USER', 'SYSTEM_USER', 'SELECT SYSTEM_USER AS system_user;', 'Returns system user name.'],
  ['USER_NAME', 'USER_NAME([id])', 'SELECT USER_NAME() AS user_name;', 'Returns user name from user identifier.'],
]

const SQL_TUTORIAL_TOPICS = [
  'SQL HOME', 'SQL Intro', 'SQL Syntax', 'SQL Select', 'SQL Select Distinct', 'SQL Where', 'SQL Order By',
  'SQL And', 'SQL Or', 'SQL Not', 'SQL Insert Into', 'SQL Null Values', 'SQL Update', 'SQL Delete',
  'SQL Select Top', 'SQL Aggregate Functions', 'SQL Min()', 'SQL Max()', 'SQL Count()', 'SQL Sum()', 'SQL Avg()',
  'SQL Like', 'SQL Wildcards', 'SQL In', 'SQL Between', 'SQL Aliases', 'SQL Joins', 'SQL Inner Join',
  'SQL Left Join', 'SQL Right Join', 'SQL Full Join', 'SQL Self Join', 'SQL Union', 'SQL Union All',
  'SQL Group By', 'SQL Having', 'SQL Exists', 'SQL Any', 'SQL All', 'SQL Select Into', 'SQL Insert Into Select',
  'SQL Case', 'SQL Null Functions', 'SQL Stored Procedures', 'SQL Comments', 'SQL Operators',
]

const SQL_DATABASE_TOPICS = [
  'SQL Create DB', 'SQL Drop DB', 'SQL Backup DB', 'SQL Create Table', 'SQL Drop Table', 'SQL Alter Table',
  'SQL Constraints', 'SQL Not Null', 'SQL Unique', 'SQL Primary Key', 'SQL Foreign Key', 'SQL Check',
  'SQL Default', 'SQL Create Index', 'SQL Auto Increment', 'SQL Dates', 'SQL Views', 'SQL Injection',
  'SQL Parameters', 'SQL Prepared Statements', 'SQL Hosting',
]

const TUTORIAL_EXAMPLES = {
  'SQL Select': 'SELECT * FROM customers;',
  'SQL Select Distinct': 'SELECT DISTINCT city FROM customers;',
  'SQL Where': "SELECT * FROM customers WHERE country = 'Malaysia';",
  'SQL Order By': 'SELECT * FROM customers ORDER BY created_at DESC;',
  'SQL And': "SELECT * FROM customers WHERE country = 'Malaysia' AND credit_score > 700;",
  'SQL Or': "SELECT * FROM customers WHERE country = 'Malaysia' OR country = 'Singapore';",
  'SQL Not': "SELECT * FROM customers WHERE NOT country = 'Malaysia';",
  'SQL Insert Into': "INSERT INTO customers (customer_id, full_name, city) VALUES (1001, 'Aisyah', 'Kuala Lumpur');",
  'SQL Null Values': 'SELECT * FROM customers WHERE city IS NULL;',
  'SQL Update': "UPDATE customers SET city = 'Riyadh' WHERE customer_id = 1001;",
  'SQL Delete': 'DELETE FROM customers WHERE customer_id = 1001;',
  'SQL Select Top': 'SELECT * FROM customers LIMIT 10;',
  'SQL Aggregate Functions': 'SELECT COUNT(*) AS total_rows, AVG(credit_score) AS avg_score FROM customers;',
  'SQL Min()': 'SELECT MIN(credit_score) AS min_score FROM customers;',
  'SQL Max()': 'SELECT MAX(credit_score) AS max_score FROM customers;',
  'SQL Count()': 'SELECT COUNT(*) AS total_rows FROM customers;',
  'SQL Sum()': 'SELECT SUM(balance) AS total_balance FROM customers;',
  'SQL Avg()': 'SELECT AVG(balance) AS avg_balance FROM customers;',
  'SQL Like': "SELECT * FROM customers WHERE full_name LIKE 'A%';",
  'SQL Wildcards': "SELECT * FROM customers WHERE city LIKE '%lumpur%';",
  'SQL In': "SELECT * FROM customers WHERE country IN ('Malaysia', 'Singapore');",
  'SQL Between': 'SELECT * FROM customers WHERE credit_score BETWEEN 650 AND 750;',
  'SQL Aliases': 'SELECT full_name AS customer_name, credit_score AS score FROM customers;',
  'SQL Joins': 'SELECT c.customer_id, l.loan_id FROM customers c JOIN loans l ON c.customer_id = l.customer_id;',
  'SQL Inner Join': 'SELECT c.customer_id, l.loan_id FROM customers c INNER JOIN loans l ON c.customer_id = l.customer_id;',
  'SQL Left Join': 'SELECT c.customer_id, l.loan_id FROM customers c LEFT JOIN loans l ON c.customer_id = l.customer_id;',
  'SQL Right Join': 'SELECT c.customer_id, l.loan_id FROM customers c RIGHT JOIN loans l ON c.customer_id = l.customer_id;',
  'SQL Full Join': 'SELECT c.customer_id, l.loan_id FROM customers c FULL JOIN loans l ON c.customer_id = l.customer_id;',
  'SQL Self Join': 'SELECT a.customer_id, b.customer_id FROM customers a JOIN customers b ON a.referrer_id = b.customer_id;',
  'SQL Union': 'SELECT city FROM customers UNION SELECT city FROM branches;',
  'SQL Union All': 'SELECT city FROM customers UNION ALL SELECT city FROM branches;',
  'SQL Group By': 'SELECT country, COUNT(*) AS total FROM customers GROUP BY country;',
  'SQL Having': 'SELECT country, COUNT(*) AS total FROM customers GROUP BY country HAVING COUNT(*) > 10;',
  'SQL Exists': 'SELECT * FROM customers c WHERE EXISTS (SELECT 1 FROM loans l WHERE l.customer_id = c.customer_id);',
  'SQL Any': 'SELECT * FROM loans WHERE amount > ANY (SELECT amount FROM approved_loans);',
  'SQL All': 'SELECT * FROM loans WHERE amount > ALL (SELECT amount FROM rejected_loans);',
  'SQL Select Into': 'SELECT * INTO customers_backup FROM customers;',
  'SQL Insert Into Select': 'INSERT INTO customers_archive SELECT * FROM customers WHERE status = "inactive";',
  'SQL Case': "SELECT customer_id, CASE WHEN credit_score >= 700 THEN 'GOOD' ELSE 'RISK' END AS segment FROM customers;",
  'SQL Null Functions': 'SELECT COALESCE(city, "Unknown") AS city_name FROM customers;',
  'SQL Stored Procedures': 'CREATE PROCEDURE GetCustomers AS SELECT * FROM customers;',
  'SQL Comments': '-- This is a single-line SQL comment',
  'SQL Operators': 'SELECT * FROM customers WHERE credit_score >= 700 AND city <> "Unknown";',
}

const DATABASE_EXAMPLES = {
  'SQL Create DB': 'CREATE DATABASE risk_warehouse;',
  'SQL Drop DB': 'DROP DATABASE risk_warehouse;',
  'SQL Backup DB': '-- Backup is DB-engine specific (e.g. BACKUP DATABASE in SQL Server).',
  'SQL Create Table': 'CREATE TABLE customers (customer_id INT PRIMARY KEY, full_name VARCHAR(120), city VARCHAR(80));',
  'SQL Drop Table': 'DROP TABLE customers;',
  'SQL Alter Table': 'ALTER TABLE customers ADD email VARCHAR(120);',
  'SQL Constraints': 'CREATE TABLE loans (loan_id INT PRIMARY KEY, amount DECIMAL(12,2) CHECK (amount > 0));',
  'SQL Not Null': 'CREATE TABLE customers (customer_id INT NOT NULL, full_name VARCHAR(120) NOT NULL);',
  'SQL Unique': 'CREATE TABLE customers (email VARCHAR(120) UNIQUE);',
  'SQL Primary Key': 'CREATE TABLE customers (customer_id INT PRIMARY KEY, full_name VARCHAR(120));',
  'SQL Foreign Key': 'CREATE TABLE loans (loan_id INT PRIMARY KEY, customer_id INT, FOREIGN KEY (customer_id) REFERENCES customers(customer_id));',
  'SQL Check': 'CREATE TABLE loans (loan_id INT, amount DECIMAL(12,2), CHECK (amount > 0));',
  'SQL Default': 'CREATE TABLE customers (status VARCHAR(20) DEFAULT "ACTIVE");',
  'SQL Create Index': 'CREATE INDEX idx_customers_city ON customers(city);',
  'SQL Auto Increment': 'CREATE TABLE customers (customer_id INT IDENTITY(1,1) PRIMARY KEY, full_name VARCHAR(120));',
  'SQL Dates': "SELECT * FROM loans WHERE application_date >= '2026-01-01';",
  'SQL Views': 'CREATE VIEW vw_high_risk AS SELECT * FROM customers WHERE credit_score < 650;',
  'SQL Injection': '-- Use parameterized queries to prevent SQL injection.',
  'SQL Parameters': 'SELECT * FROM customers WHERE customer_id = @customerId;',
  'SQL Prepared Statements': 'PREPARE stmt FROM "SELECT * FROM customers WHERE customer_id = ?";',
  'SQL Hosting': '-- Hosting depends on your RDBMS deployment and infrastructure.',
}

export const SQL_REFERENCE_FUNCTIONS = [
  ...STRING_FUNCTIONS.map(r => [...r, 'string']),
  ...NUMERIC_FUNCTIONS.map(r => [...r, 'numeric']),
  ...DATE_FUNCTIONS.map(r => [...r, 'date']),
  ...ADVANCED_FUNCTIONS.map(r => [...r, 'advanced']),
].map(([name, signature, example, description, group]) => ({
  name,
  signature,
  parameters: parseSignatureParameters(signature),
  description,
  example,
  group,
}))

export const SQL_REFERENCE_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'INNER JOIN',
  'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT INTO', 'UPDATE', 'DELETE',
  'CREATE TABLE', 'DROP TABLE', 'ALTER TABLE', 'CREATE DATABASE', 'DROP DATABASE',
  'DISTINCT', 'IN', 'BETWEEN', 'LIKE', 'EXISTS', 'ANY', 'ALL', 'UNION', 'UNION ALL',
  'PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK', 'DEFAULT', 'NOT NULL', 'VIEW',
  ...SQL_TUTORIAL_TOPICS,
  ...SQL_DATABASE_TOPICS,
]

// ══════════════════════════════════════════════════════════════════════════════
// Demo dataset + example generators
// Every generated example runs against my_db.demo (created by the Setup cell), so
// each function/syntax entry shows 3 concrete variants over real sample data.
// ══════════════════════════════════════════════════════════════════════════════

// Bump this when the generated notebook content changes, so existing users get
// the refreshed reference notebooks (see ensureSqlReferenceNotebooks in appStore).
export const SQL_REFERENCE_VERSION = 3

const STR_COLS = ['name', 'category', 'city']
const NUM_COLS = ['amount', 'qty', 'score']
const DATE_COLS = ['created_at', 'updated_at', 'due_date']

export function buildDemoSetupSql() {
  return [
    '-- ⚙️ SETUP — run this cell first.',
    '-- Creates my_db and the demo table that every example below uses.',
    'CREATE DATABASE IF NOT EXISTS my_db;',
    'USE my_db;',
    'DROP TABLE IF EXISTS demo;',
    'CREATE TABLE demo (',
    '  id INTEGER, name TEXT, category TEXT, city TEXT,',
    '  amount REAL, qty INTEGER, score REAL,',
    '  created_at DATE, updated_at DATE, due_date DATE,',
    '  is_active INTEGER, notes TEXT',
    ');',
    'INSERT INTO demo (id, name, category, city, amount, qty, score, created_at, updated_at, due_date, is_active, notes) VALUES',
    "  (1, 'Aisyah Rahman', 'Retail', 'Kuala Lumpur', 1520.75, 3, 88.5, '2024-01-15', '2024-06-01', '2026-03-31', 1, 'VIP client'),",
    "  (2, 'Budi Santoso', 'Corporate', 'Johor Bahru', 9800.00, 12, 72.0, '2023-11-02', '2024-05-20', '2026-04-30', 1, NULL),",
    "  (3, 'Chen Wei', 'Retail', 'Penang', 340.50, 1, 65.25, '2024-03-10', '2024-04-18', '2026-02-28', 0, 'Follow up'),",
    "  (4, 'Devi Kumar', 'SME', 'Ipoh', 5600.00, 7, 91.0, '2022-07-21', '2024-06-15', '2026-05-31', 1, NULL),",
    "  (5, 'Emily Tan', 'Corporate', 'Kuala Lumpur', 12040.25, 20, 84.75, '2023-02-14', '2024-03-30', '2026-01-31', 1, 'Key account'),",
    "  (6, 'Faisal Idris', 'Retail', 'Melaka', 780.00, 2, 58.0, '2024-05-05', '2024-05-25', '2026-06-30', 0, NULL),",
    "  (7, 'Grace Lim', 'SME', 'Penang', 3300.90, 5, 77.5, '2023-09-19', '2024-06-10', '2026-03-15', 1, 'Renewal'),",
    "  (8, 'Hafiz Omar', 'Corporate', 'Johor Bahru', 8750.00, 15, 69.0, '2022-12-01', '2024-02-28', '2026-04-20', 1, NULL),",
    "  (9, 'Iman Yusof', 'Retail', 'Ipoh', 210.40, 1, 95.0, '2024-06-01', '2024-06-20', '2026-07-31', 1, 'New'),",
    "  (10, 'Jason Ng', 'SME', 'Kuala Lumpur', 4600.00, 9, 80.25, '2023-04-27', '2024-05-11', '2026-05-15', 0, 'Overdue');",
    'SELECT * FROM demo;',
  ].join('\n')
}

const AGGREGATES = new Set(['AVG', 'SUM', 'MIN', 'MAX', 'COUNT'])
const NO_PAREN = new Set(['CURRENT_USER', 'SESSION_USER', 'SYSTEM_USER', 'CURRENT_TIMESTAMP'])
const ZERO_ARG_PAREN = new Set(['GETDATE', 'GETUTCDATE', 'SYSDATETIME', 'SYSDATE', 'NOW', 'CURDATE', 'CURTIME', 'TODAY', 'PI', 'RAND'])

// Per-function expression builder: (column, index) => valid scalar SQL expression.
const FN_EXPR = {
  // ── string ──
  SUBSTRING: (c) => `SUBSTRING(${c}, 1, 3)`,
  LEFT: (c) => `LEFT(${c}, 3)`,
  RIGHT: (c) => `RIGHT(${c}, 3)`,
  CHARINDEX: (c) => `CHARINDEX('a', ${c})`,
  PATINDEX: (c) => `PATINDEX('%a%', ${c})`,
  REPLACE: (c) => `REPLACE(${c}, 'a', 'X')`,
  REPLICATE: (c) => `REPLICATE(SUBSTRING(${c}, 1, 1), 3)`,
  CONCAT: (c) => `CONCAT(${c}, '-', id)`,
  CONCAT_WS: (c) => `CONCAT_WS('/', ${c}, category)`,
  STUFF: (c) => `STUFF(${c}, 1, 2, '**')`,
  TRANSLATE: (c) => `TRANSLATE(${c}, 'ae', 'AE')`,
  DIFFERENCE: (c) => `DIFFERENCE(${c}, city)`,
  QUOTENAME: (c) => `QUOTENAME(${c})`,
  DATALENGTH: (c) => `DATALENGTH(${c})`,
  CHAR: (_, i) => `CHAR(${65 + i})`,
  NCHAR: (_, i) => `NCHAR(${9731 + i})`,
  SPACE: (_, i) => `('[' || SPACE(${i + 1}) || ']')`,
  STR: (_, i) => `STR(${NUM_COLS[i]})`,
  FORMAT: (_, i) => `FORMAT(amount, 'N${i}')`,
  // ── numeric ──
  ROUND: (c) => `ROUND(${c}, 1)`,
  POWER: (c) => `POWER(${c}, 2)`,
  LOG: (c) => `LOG(${c} + 1)`,
  LOG10: (c) => `LOG10(${c} + 1)`,
  SQRT: (c) => `SQRT(ABS(${c}))`,
  SIGN: (c) => `SIGN(${c} - 100)`,
  ACOS: (_, i) => `ACOS(${[1.0, 0.5, 0.0][i]})`,
  ASIN: (_, i) => `ASIN(${[1.0, 0.5, 0.0][i]})`,
  ATAN: (_, i) => `ATAN(${[0.5, 1.0, 2.0][i]})`,
  ATN2: (_, i) => `ATN2(${i + 1}.0, 2.0)`,
  COS: (_, i) => `COS(${[0, 1, 2][i]})`,
  SIN: (_, i) => `SIN(${[0, 1, 2][i]})`,
  COT: (_, i) => `COT(${[1, 2, 3][i]})`,
  EXP: (_, i) => `EXP(${[1, 2, 3][i]})`,
  DEGREES: (_, i) => `DEGREES(${[1, 2, 3][i]})`,
  RADIANS: (_, i) => `RADIANS(${[30, 60, 90][i]})`,
  // ── date ──
  DATEDIFF: (c) => `DATEDIFF('day', ${c}, due_date)`,
  DATEADD: (c) => `DATEADD('month', 1, ${c})`,
  DATENAME: (c) => `DATENAME('month', ${c})`,
  DATEPART: (c) => `DATEPART('year', ${c})`,
  DATEFROMPARTS: (_, i) => `DATEFROMPARTS(2026, ${i + 1}, 15)`,
  EOMONTH: (c) => `EOMONTH(${c})`,
  DATE_FORMAT: (c) => `DATE_FORMAT(${c}, '%Y-%m')`,
  TO_CHAR: (c) => `TO_CHAR(${c}, 'YYYY-MM-DD')`,
  ADD_MONTHS: (c) => `ADD_MONTHS(${c}, 2)`,
  ISDATE: (c) => `ISDATE(${c})`,
}

// Whole-body overrides for heterogeneous / conversion functions.
const FN_FIXED = {
  CAST: 'SELECT CAST(amount AS INTEGER) AS to_int, CAST(qty AS REAL) AS to_real, CAST(id AS TEXT) AS to_text FROM demo LIMIT 5;',
  CONVERT: 'SELECT CONVERT(INTEGER, amount) AS c1, CONVERT(TEXT, qty) AS c2, CONVERT(TEXT, created_at) AS c3 FROM demo LIMIT 5; -- CONVERT support varies by engine',
  COALESCE: "SELECT COALESCE(notes, 'n/a') AS c1, COALESCE(notes, city) AS c2, COALESCE(NULL, category, 'x') AS c3 FROM demo LIMIT 5;",
  ISNULL: "SELECT ISNULL(notes, 'n/a') AS c1, ISNULL(notes, city) AS c2, ISNULL(NULL, 0) AS c3 FROM demo LIMIT 5;",
  NULLIF: "SELECT NULLIF(category, 'Retail') AS c1, NULLIF(qty, 1) AS c2, NULLIF(city, 'Ipoh') AS c3 FROM demo LIMIT 5;",
  IIF: "SELECT IIF(score >= 80, 'HIGH', 'LOW') AS c1, IIF(amount > 5000, 'BIG', 'SMALL') AS c2, IIF(is_active = 1, 'YES', 'NO') AS c3 FROM demo LIMIT 5;",
  ISNUMERIC: 'SELECT ISNUMERIC(amount) AS c1, ISNUMERIC(name) AS c2, ISNUMERIC(qty) AS c3 FROM demo LIMIT 5; -- ISNUMERIC support varies by engine',
  CURRENT_USER: "-- CURRENT_USER is a SQL Server keyword (no equivalent in SQLite). Use USER_NAME():\nSELECT USER_NAME() AS current_user;",
  SESSION_USER: "-- SESSION_USER is a SQL Server keyword (no equivalent in SQLite). Use USER_NAME():\nSELECT USER_NAME() AS session_user;",
  SYSTEM_USER: "-- SYSTEM_USER is a SQL Server keyword (no equivalent in SQLite). Use USER_NAME():\nSELECT USER_NAME() AS system_user;",
  USER_NAME: 'SELECT USER_NAME() AS user_name;',
  SESSIONPROPERTY: "-- SESSIONPROPERTY is SQL Server-specific and not supported in this SQLite workspace.\nSELECT NULL AS ansi_nulls;",
}

// Builds a runnable cell (USE my_db + a query producing 3 example variants).
function buildFunctionExamples(fn) {
  let body
  if (FN_FIXED[fn.name]) {
    body = FN_FIXED[fn.name]
  } else if (NO_PAREN.has(fn.name)) {
    body = `SELECT ${fn.name} AS value, name FROM demo LIMIT 3;`
  } else if (ZERO_ARG_PAREN.has(fn.name)) {
    body = `SELECT ${fn.name}() AS value, name FROM demo LIMIT 3;`
  } else if (AGGREGATES.has(fn.name)) {
    body = fn.name === 'COUNT'
      ? 'SELECT COUNT(*) AS all_rows, COUNT(notes) AS non_null_notes, COUNT(DISTINCT category) AS distinct_categories FROM demo;'
      : `SELECT ${fn.name}(amount) AS by_amount, ${fn.name}(qty) AS by_qty, ${fn.name}(score) AS by_score FROM demo;`
  } else {
    const cols = fn.group === 'string' ? STR_COLS : fn.group === 'date' ? DATE_COLS : NUM_COLS
    const builder = FN_EXPR[fn.name] || ((c) => `${fn.name}(${c})`)
    const parts = cols.map((c, i) => `${builder(c, i)} AS ex_${i + 1}`)
    body = `SELECT id, ${parts.join(', ')} FROM demo LIMIT 5;`
  }
  return `USE my_db;\n-- ${fn.name}: ${fn.description}\n${body}`
}

// Demo-based examples for the tutorial-syntax topics (3 variants each where it fits).
const DEMO_TUTORIAL_EXAMPLES = {
  'SQL Select': "USE my_db;\nSELECT * FROM demo;\nSELECT id, name, city FROM demo;\nSELECT name, amount FROM demo;",
  'SQL Select Distinct': "USE my_db;\nSELECT DISTINCT category FROM demo;\nSELECT DISTINCT city FROM demo;\nSELECT DISTINCT category, city FROM demo;",
  'SQL Where': "USE my_db;\nSELECT * FROM demo WHERE category = 'Retail';\nSELECT * FROM demo WHERE amount > 2000;\nSELECT * FROM demo WHERE city = 'Kuala Lumpur';",
  'SQL Order By': "USE my_db;\nSELECT * FROM demo ORDER BY amount DESC;\nSELECT * FROM demo ORDER BY created_at ASC;\nSELECT * FROM demo ORDER BY name;",
  'SQL And': "USE my_db;\nSELECT * FROM demo WHERE category = 'Retail' AND amount > 1000;\nSELECT * FROM demo WHERE is_active = 1 AND score >= 80;\nSELECT * FROM demo WHERE city = 'Kuala Lumpur' AND qty > 2;",
  'SQL Or': "USE my_db;\nSELECT * FROM demo WHERE category = 'Retail' OR category = 'Corporate';\nSELECT * FROM demo WHERE amount > 5000 OR score > 85;\nSELECT * FROM demo WHERE city = 'Ipoh' OR city = 'Penang';",
  'SQL Not': "USE my_db;\nSELECT * FROM demo WHERE NOT category = 'Retail';\nSELECT * FROM demo WHERE NOT amount > 2000;\nSELECT * FROM demo WHERE notes IS NOT NULL;",
  'SQL Insert Into': "USE my_db;\nINSERT INTO demo (id, name, category, city, amount, qty, score, created_at) VALUES (101, 'New Client', 'Retail', 'Ipoh', 500.00, 1, 70.0, '2026-01-01');\nSELECT * FROM demo WHERE id = 101;",
  'SQL Null Values': "USE my_db;\nSELECT * FROM demo WHERE notes IS NULL;\nSELECT * FROM demo WHERE notes IS NOT NULL;\nSELECT id, COALESCE(notes, 'n/a') AS notes2 FROM demo;",
  'SQL Update': "USE my_db;\nUPDATE demo SET city = 'Melaka' WHERE id = 1;\nSELECT * FROM demo WHERE id = 1;",
  'SQL Delete': "USE my_db;\nDELETE FROM demo WHERE id = 101;\nSELECT COUNT(*) AS remaining FROM demo;",
  'SQL Select Top': "USE my_db;\nSELECT * FROM demo LIMIT 3;\nSELECT * FROM demo ORDER BY amount DESC LIMIT 5;\nSELECT name, score FROM demo ORDER BY score DESC LIMIT 2;",
  'SQL Aggregate Functions': "USE my_db;\nSELECT COUNT(*) AS rows, AVG(score) AS avg_score, SUM(amount) AS total FROM demo;",
  'SQL Min()': "USE my_db;\nSELECT MIN(amount) AS min_amount FROM demo;\nSELECT MIN(qty) AS min_qty FROM demo;\nSELECT MIN(created_at) AS earliest FROM demo;",
  'SQL Max()': "USE my_db;\nSELECT MAX(amount) AS max_amount FROM demo;\nSELECT MAX(qty) AS max_qty FROM demo;\nSELECT MAX(created_at) AS latest FROM demo;",
  'SQL Count()': "USE my_db;\nSELECT COUNT(*) AS total FROM demo;\nSELECT COUNT(notes) AS with_notes FROM demo;\nSELECT COUNT(DISTINCT category) AS categories FROM demo;",
  'SQL Sum()': "USE my_db;\nSELECT SUM(amount) AS total_amount FROM demo;\nSELECT SUM(qty) AS total_qty FROM demo;\nSELECT category, SUM(amount) AS total FROM demo GROUP BY category;",
  'SQL Avg()': "USE my_db;\nSELECT AVG(amount) AS avg_amount FROM demo;\nSELECT AVG(score) AS avg_score FROM demo;\nSELECT category, AVG(score) AS avg_score FROM demo GROUP BY category;",
  'SQL Like': "USE my_db;\nSELECT * FROM demo WHERE name LIKE 'A%';\nSELECT * FROM demo WHERE city LIKE '%a%';\nSELECT * FROM demo WHERE category LIKE 'Ret%';",
  'SQL Wildcards': "USE my_db;\nSELECT * FROM demo WHERE city LIKE '%lumpur%';\nSELECT * FROM demo WHERE name LIKE '_a%';\nSELECT * FROM demo WHERE category LIKE 'S%';",
  'SQL In': "USE my_db;\nSELECT * FROM demo WHERE category IN ('Retail', 'Corporate');\nSELECT * FROM demo WHERE city IN ('Ipoh', 'Penang');\nSELECT * FROM demo WHERE qty IN (1, 2, 3);",
  'SQL Between': "USE my_db;\nSELECT * FROM demo WHERE amount BETWEEN 1000 AND 5000;\nSELECT * FROM demo WHERE score BETWEEN 70 AND 90;\nSELECT * FROM demo WHERE created_at BETWEEN '2024-01-01' AND '2024-12-31';",
  'SQL Aliases': "USE my_db;\nSELECT name AS client, amount AS balance FROM demo;\nSELECT category AS segment, COUNT(*) AS n FROM demo GROUP BY category;\nSELECT id, score AS rating FROM demo;",
  'SQL Joins': "USE my_db;\nSELECT a.name, b.name AS other FROM demo a JOIN demo b ON a.category = b.category AND a.id < b.id LIMIT 10;",
  'SQL Inner Join': "USE my_db;\nSELECT a.name, b.city FROM demo a INNER JOIN demo b ON a.city = b.city AND a.id < b.id LIMIT 10;",
  'SQL Left Join': "USE my_db;\nSELECT a.name, b.name AS match FROM demo a LEFT JOIN demo b ON a.category = b.category AND a.id <> b.id LIMIT 10;",
  'SQL Right Join': "USE my_db;\n-- SQLite has no RIGHT JOIN; swap tables and use LEFT JOIN instead.\nSELECT a.name, b.name AS match FROM demo a LEFT JOIN demo b ON a.category = b.category AND a.id <> b.id LIMIT 10;",
  'SQL Full Join': "USE my_db;\n-- FULL JOIN may be unsupported; emulate with LEFT JOIN + UNION if needed.\nSELECT a.name, b.name FROM demo a LEFT JOIN demo b ON a.city = b.city LIMIT 10;",
  'SQL Self Join': "USE my_db;\nSELECT a.name AS person, b.name AS same_city FROM demo a JOIN demo b ON a.city = b.city AND a.id < b.id;",
  'SQL Union': "USE my_db;\nSELECT city FROM demo WHERE category = 'Retail' UNION SELECT city FROM demo WHERE category = 'Corporate';",
  'SQL Union All': "USE my_db;\nSELECT category AS val FROM demo UNION ALL SELECT city AS val FROM demo;",
  'SQL Group By': "USE my_db;\nSELECT category, COUNT(*) AS n FROM demo GROUP BY category;\nSELECT city, SUM(amount) AS total FROM demo GROUP BY city;\nSELECT is_active, AVG(score) AS avg_score FROM demo GROUP BY is_active;",
  'SQL Having': "USE my_db;\nSELECT category, COUNT(*) AS n FROM demo GROUP BY category HAVING COUNT(*) > 1;\nSELECT city, SUM(amount) AS total FROM demo GROUP BY city HAVING SUM(amount) > 2000;",
  'SQL Exists': "USE my_db;\nSELECT * FROM demo a WHERE EXISTS (SELECT 1 FROM demo b WHERE b.category = a.category AND b.id <> a.id);",
  'SQL Any': "USE my_db;\n-- ANY/ALL may be unsupported locally; equivalent with MAX/MIN:\nSELECT * FROM demo WHERE amount > (SELECT MIN(amount) FROM demo WHERE category = 'Corporate');",
  'SQL All': "USE my_db;\n-- ALL equivalent with MAX:\nSELECT * FROM demo WHERE amount > (SELECT MAX(amount) FROM demo WHERE category = 'Retail');",
  'SQL Select Into': "USE my_db;\nDROP TABLE IF EXISTS demo_backup;\nSELECT * INTO demo_backup FROM demo;\nSELECT COUNT(*) AS backed_up FROM demo_backup;",
  'SQL Insert Into Select': "USE my_db;\nDROP TABLE IF EXISTS demo_retail;\nCREATE TABLE demo_retail (id INTEGER, name TEXT, amount REAL);\nINSERT INTO demo_retail (id, name, amount) SELECT id, name, amount FROM demo WHERE category = 'Retail';\nSELECT * FROM demo_retail;",
  'SQL Case': "USE my_db;\nSELECT name, CASE WHEN score >= 80 THEN 'HIGH' WHEN score >= 60 THEN 'MED' ELSE 'LOW' END AS band FROM demo;",
  'SQL Null Functions': "USE my_db;\nSELECT id, COALESCE(notes, 'Unknown') AS c1 FROM demo;\nSELECT id, ISNULL(notes, 'n/a') AS c2 FROM demo;\nSELECT id, IFNULL(notes, '-') AS c3 FROM demo;",
  'SQL Stored Procedures': "-- Stored procedures are engine-specific and not supported in this local workspace.\n-- Save the query as a reusable snippet instead.\nUSE my_db;\nSELECT * FROM demo;",
  'SQL Comments': "USE my_db;\n-- Single-line comment\n/* Multi-line\n   comment */\nSELECT id, name FROM demo; -- inline comment",
  'SQL Operators': "USE my_db;\nSELECT * FROM demo WHERE score >= 80 AND amount <> 0;\nSELECT id, amount * qty AS total_value FROM demo;\nSELECT id, (score + 10) AS boosted FROM demo;",
}

// Demo-based examples for the database/DDL topics.
const DEMO_DATABASE_EXAMPLES = {
  'SQL Create DB': "CREATE DATABASE IF NOT EXISTS my_db;\nUSE my_db;\nSELECT 'my_db ready' AS status;",
  'SQL Drop DB': "-- Careful: DROP DATABASE removes everything.\n-- CREATE DATABASE IF NOT EXISTS scratch_db;\n-- DROP DATABASE scratch_db;\nSELECT 'see commented example above' AS note;",
  'SQL Backup DB': "-- Backup is engine-specific. In this workspace, copy a table:\nUSE my_db;\nDROP TABLE IF EXISTS demo_backup;\nSELECT * INTO demo_backup FROM demo;\nSELECT COUNT(*) AS backed_up FROM demo_backup;",
  'SQL Create Table': "USE my_db;\nDROP TABLE IF EXISTS demo_copy;\nCREATE TABLE demo_copy (id INTEGER, name TEXT, amount REAL, created_at DATE);\nSELECT 'created' AS status;",
  'SQL Drop Table': "USE my_db;\nCREATE TABLE IF NOT EXISTS scratch (id INTEGER);\nDROP TABLE scratch;\nSELECT 'dropped' AS status;",
  'SQL Alter Table': "USE my_db;\nALTER TABLE demo ADD COLUMN email TEXT;\nSELECT id, email FROM demo LIMIT 3;",
  'SQL Constraints': "USE my_db;\nDROP TABLE IF EXISTS demo_constrained;\nCREATE TABLE demo_constrained (id INTEGER PRIMARY KEY, amount REAL CHECK (amount > 0));\nSELECT 'created' AS status;",
  'SQL Not Null': "USE my_db;\nDROP TABLE IF EXISTS demo_nn;\nCREATE TABLE demo_nn (id INTEGER NOT NULL, name TEXT NOT NULL);\nSELECT 'created' AS status;",
  'SQL Unique': "USE my_db;\nDROP TABLE IF EXISTS demo_u;\nCREATE TABLE demo_u (id INTEGER, email TEXT UNIQUE);\nSELECT 'created' AS status;",
  'SQL Primary Key': "USE my_db;\nDROP TABLE IF EXISTS demo_pk;\nCREATE TABLE demo_pk (id INTEGER PRIMARY KEY, name TEXT);\nSELECT 'created' AS status;",
  'SQL Foreign Key': "USE my_db;\nDROP TABLE IF EXISTS demo_child;\nCREATE TABLE demo_child (child_id INTEGER PRIMARY KEY, demo_id INTEGER, FOREIGN KEY (demo_id) REFERENCES demo(id));\nSELECT 'created' AS status;",
  'SQL Check': "USE my_db;\nDROP TABLE IF EXISTS demo_check;\nCREATE TABLE demo_check (id INTEGER, amount REAL, CHECK (amount >= 0));\nSELECT 'created' AS status;",
  'SQL Default': "USE my_db;\nDROP TABLE IF EXISTS demo_default;\nCREATE TABLE demo_default (id INTEGER, status TEXT DEFAULT 'ACTIVE');\nINSERT INTO demo_default (id) VALUES (1);\nSELECT * FROM demo_default;",
  'SQL Create Index': "USE my_db;\nCREATE INDEX IF NOT EXISTS idx_demo_city ON demo(city);\nSELECT 'index created' AS status;",
  'SQL Auto Increment': "USE my_db;\nDROP TABLE IF EXISTS demo_auto;\nCREATE TABLE demo_auto (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);\nINSERT INTO demo_auto (name) VALUES ('a'), ('b');\nSELECT * FROM demo_auto;",
  'SQL Dates': "USE my_db;\nSELECT * FROM demo WHERE created_at >= '2024-01-01';\nSELECT id, YEAR(created_at) AS yr, MONTH(created_at) AS mo FROM demo;\nSELECT id, DATEDIFF('day', created_at, due_date) AS days_to_due FROM demo;",
  'SQL Views': "USE my_db;\nDROP VIEW IF EXISTS vw_high_score;\nCREATE VIEW vw_high_score AS SELECT id, name, score FROM demo WHERE score >= 80;\nSELECT * FROM vw_high_score;",
  'SQL Injection': "-- Never concatenate user input into SQL. Use safe literals / parameters.\nUSE my_db;\nSELECT * FROM demo WHERE id = 1;",
  'SQL Parameters': "-- This workspace runs literal SQL; substitute values directly:\nUSE my_db;\nSELECT * FROM demo WHERE category = 'Retail';",
  'SQL Prepared Statements': "-- Prepared statements are driver-level; run the final SQL here:\nUSE my_db;\nSELECT * FROM demo WHERE id = 1;",
  'SQL Hosting': "-- Hosting depends on your deployment.\nUSE my_db;\nSELECT 'local workspace' AS environment;",
}

function parseSignatureParameters(signature = '') {
  const open = signature.indexOf('(')
  const close = signature.lastIndexOf(')')
  if (open < 0 || close <= open) return []
  return signature
    .slice(open + 1, close)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function createTopicEntry(topic, exampleMap) {
  const sql = exampleMap[topic] || `-- ${topic}\nSELECT 1 AS example;`
  return {
    title: topic,
    markdown: `## ${topic}\nSource: W3Schools SQL\n\nExample syntax:`,
    sql,
  }
}

function createFunctionEntry(fn) {
  return {
    title: fn.name,
    markdown: `## ${fn.name}\n${fn.description}\n\nSignature: \`${fn.signature}\`\n\n3 runnable examples over \`my_db.demo\` (${fn.group}):`,
    sql: buildFunctionExamples(fn),
  }
}

function toNotebookCells(entries, prefix) {
  const cells = [
    {
      id: `${prefix}_intro_md`,
      type: 'markdown',
      content: `# ${prefix.replace(/_/g, ' ')}\nGenerated from the W3Schools SQL reference, with runnable examples over a demo table.\n\n**Run the Setup cell below first** — it creates \`my_db\` and the \`demo\` table that every example uses.`,
      result: null,
    },
    {
      id: `${prefix}_setup_md`,
      type: 'markdown',
      content: '## ⚙️ Setup — demo database & table\nCreates `my_db.demo` with 10 sample rows spanning text, numeric and date columns (plus NULLs).',
      result: null,
    },
    {
      id: `${prefix}_setup_sql`,
      type: 'sql',
      content: buildDemoSetupSql(),
      result: null,
    },
  ]

  entries.forEach((entry, index) => {
    cells.push({
      id: `${prefix}_md_${index + 1}`,
      type: 'markdown',
      content: entry.markdown,
      result: null,
    })
    cells.push({
      id: `${prefix}_sql_${index + 1}`,
      type: 'sql',
      content: entry.sql,
      result: null,
    })
  })

  return cells
}

export function buildSqlReferenceNotebooks() {
  const functionEntries = SQL_REFERENCE_FUNCTIONS.map(createFunctionEntry)
  const tutorialEntries = SQL_TUTORIAL_TOPICS.map((topic) => createTopicEntry(topic, DEMO_TUTORIAL_EXAMPLES))
  const databaseEntries = SQL_DATABASE_TOPICS.map((topic) => createTopicEntry(topic, DEMO_DATABASE_EXAMPLES))

  return [
    {
      id: 'system_sql_functions_w3schools',
      name: 'W3Schools SQL Functions (Examples)',
      createdAt: new Date().toLocaleDateString(),
      system: true,
      version: SQL_REFERENCE_VERSION,
      cells: toNotebookCells(functionEntries, 'sql_functions_reference'),
    },
    {
      id: 'system_sql_tutorial_w3schools',
      name: 'W3Schools SQL Tutorial Syntax (Examples)',
      createdAt: new Date().toLocaleDateString(),
      system: true,
      version: SQL_REFERENCE_VERSION,
      cells: toNotebookCells(tutorialEntries, 'sql_tutorial_reference'),
    },
    {
      id: 'system_sql_database_w3schools',
      name: 'W3Schools SQL Database Syntax (Examples)',
      createdAt: new Date().toLocaleDateString(),
      system: true,
      version: SQL_REFERENCE_VERSION,
      cells: toNotebookCells(databaseEntries, 'sql_database_reference'),
    },
  ]
}
