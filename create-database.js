// create-database.js - 数据库初始化脚本
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 数据库文件路径
const dbPath = path.join(__dirname, 'demo.db');

// 创建/打开数据库
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ 数据库创建失败:', err.message);
    return;
  }
  console.log('✅ 数据库连接成功:', dbPath);
});

// 开始数据库初始化
db.serialize(() => {
  console.log('📋 开始创建表...');
  
  // 1. 创建用户表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      age INTEGER,
      city TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('❌ users 表创建失败:', err.message);
    } else {
      console.log('✅ users 表创建成功');
    }
  });

  // 2. 创建产品表
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      price REAL NOT NULL,
      stock INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('❌ products 表创建失败:', err.message);
    } else {
      console.log('✅ products 表创建成功');
    }
  });

  // 3. 创建订单表
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      product_id INTEGER,
      quantity INTEGER NOT NULL,
      total_price REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ orders 表创建失败:', err.message);
    } else {
      console.log('✅ orders 表创建成功');
    }
  });

  console.log('\n📝 开始插入测试数据...\n');

  // 插入用户数据
  const userStmt = db.prepare('INSERT INTO users (name, email, age, city) VALUES (?, ?, ?, ?)');
  const users = [
    ['张三', 'zhangsan@example.com', 28, '北京'],
    ['李四', 'lisi@example.com', 34, '上海'],
    ['王五', 'wangwu@example.com', 25, '广州'],
    ['赵六', 'zhaoliu@example.com', 31, '深圳'],
    ['钱七', 'qianqi@example.com', 29, '杭州']
  ];

  users.forEach(user => {
    userStmt.run(user, (err) => {
      if (err) {
        console.error(`❌ 插入用户失败: ${user[0]}`, err.message);
      } else {
        console.log(`✅ 用户已添加: ${user[0]}`);
      }
    });
  });
  userStmt.finalize();

  // 插入产品数据
  const productStmt = db.prepare('INSERT INTO products (name, category, price, stock) VALUES (?, ?, ?, ?)');
  const products = [
    ['iPhone 15 Pro', '电子产品', 7999, 50],
    ['MacBook Pro', '电子产品', 12999, 30],
    ['AirPods Pro', '电子产品', 1999, 100],
    ['机械键盘', '电脑配件', 599, 80],
    ['鼠标垫', '电脑配件', 89, 200],
    ['显示器支架', '电脑配件', 299, 60],
    ['笔记本', '办公用品', 25, 500],
    ['钢笔', '办公用品', 150, 300]
  ];

  products.forEach(product => {
    productStmt.run(product, (err) => {
      if (err) {
        console.error(`❌ 插入产品失败: ${product[0]}`, err.message);
      } else {
        console.log(`✅ 产品已添加: ${product[0]}`);
      }
    });
  });
  productStmt.finalize();

  // 插入订单数据
  const orderStmt = db.prepare('INSERT INTO orders (user_id, product_id, quantity, total_price, status) VALUES (?, ?, ?, ?, ?)');
  const orders = [
    [1, 1, 1, 7999, 'completed'],
    [1, 3, 2, 3998, 'completed'],
    [2, 2, 1, 12999, 'pending'],
    [3, 4, 1, 599, 'completed'],
    [3, 5, 3, 267, 'completed'],
    [4, 1, 2, 15998, 'processing'],
    [5, 7, 10, 250, 'completed'],
    [2, 6, 2, 598, 'cancelled']
  ];

  orders.forEach(order => {
    orderStmt.run(order, (err) => {
      if (err) {
        console.error(`❌ 插入订单失败`, err.message);
      } else {
        console.log(`✅ 订单已添加: 用户${order[0]} -> 产品${order[1]}`);
      }
    });
  });
  orderStmt.finalize();
});

// 关闭数据库连接
db.close((err) => {
  if (err) {
    console.error('❌ 数据库关闭失败:', err.message);
  } else {
    console.log('\n🎉 数据库初始化完成!');
    console.log(`📂 数据库位置: ${dbPath}`);
    console.log('\n💡 你可以尝试以下查询:');
    console.log('   - SELECT * FROM users');
    console.log('   - SELECT * FROM products WHERE price < 1000');
    console.log('   - SELECT u.name, p.name, o.quantity FROM orders o JOIN users u ON o.user_id = u.id JOIN products p ON o.product_id = p.id');
  }
});