require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const mysql = require("mysql");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const morgan = require("morgan");
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(morgan("combined")); // 콘솔에 요청 로그를 출력하는 미들웨어를 추가
app.use(
  cors({
    origin: 'https://web-nshoesfront-1igmo82clotxbvvk.sel5.cloudtype.app/',
    credentials: true
  })
);

const db = mysql.createConnection({
  host: "svc.sel5.cloudtype.app",
  user: "root",
  password: "0810",
  database: "shopping",
  port: 32243
});
//JWT 유효성 검사
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}


db.connect((err) => {
  if (err) throw err;
  console.log("Connected to the MySQL server.");
});

// 회원가입
app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  db.query(
    "SELECT email FROM users WHERE email = ?",
    [email],
    async (error, results) => {
      if (error) {
        console.log(error);
      }

      if (results.length > 0) {
        return res.send({ message: "This email is already in use" });
      }

      const hashedPassword = await bcrypt.hash(password, 8);

      db.query(
        "INSERT INTO users SET ?",
        { name: name, email: email, password: hashedPassword },
        (error, results) => {
          if (error) {
            console.log(error);
          } else {
            return res.send({ message: "User registered" });
          }
        }
      );
    }
  );
});

// 로그인
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  // 비밀번호 해시를 위한 bcrypt
  const bcrypt = require("bcrypt");

  // 데이터베이스에서 이메일로 사용자를 조회
  db.query("SELECT * FROM users WHERE email = ?", [email], (error, results) => {
    if (error) {
      console.log(error);
      return res.status(500).send({ message: "Server error" });
    }

    if (results.length == 0) {
      return res.status(404).send({ message: "User not found" });
    }

    const user = results[0];

    // 비밀번호 검증
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        console.log(err);
        return res.status(500).send({ message: "Server error" });
      }

      if (!isMatch) {
        return res.status(401).send({ message: "Password is incorrect" });
      }

      // JWT 생성
      const jwt = require("jsonwebtoken");
      const token = jwt.sign({ id: user.id }, process.env.ACCESS_TOKEN_SECRET);

      res.send({ message: "Logged in", token: token });
    });
  });
});

//정보 수정
app.put("/users/:id", (req, res) => {
  const { name, email } = req.body;
  const userId = req.params.id;

  db.query(
    "UPDATE users SET name = ?, email = ? WHERE id = ?",
    [name, email, userId],
    (error, results) => {
      if (error) {
        console.log(error);
        return res.status(500).send({ message: "Server error" });
      }

      if (results.affectedRows == 0) {
        return res.status(404).send({ message: "User not found" });
      }

      res.send({ message: "User updated" });
    }
  );
});
//유저 정보 반환
app.get('/userinfo', authenticateToken, (req, res) => {
    const userId = req.user.id; // 토큰에서 유저 ID 가져오기
  
    db.query("SELECT * FROM users WHERE id = ?", [userId], (error, results) => {
      if (error) {
        console.log(error);
        return res.status(500).send({ message: "Server error" });
      }
  
      if (results.length == 0) {
        return res.status(404).send({ message: "User not found" });
      }
  
      const user = results[0];
      // 비밀번호는 보내지 않도록 하고, 필요한 유저 정보만 전송
      res.json({
        id: user.id,
        name: user.name,
        email: user.email,
      });
    });
  });
  

//상품 목록
app.get("/products", (req, res) => {
  db.query("SELECT * FROM products", (error, results) => {
    if (error) {
      console.log(error);
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});
//상품 정보
app.get("/products/:id", (req, res) => {
  const productId = req.params.id;

  db.query(`
    SELECT products.*, GROUP_CONCAT(Images.imageURL SEPARATOR '||') as images
    FROM products 
    LEFT JOIN Images ON products.id = Images.id
    WHERE products.id = ?
    GROUP BY products.id`, 
    [productId],
    (error, results) => {
      if (error) {
        console.log(error);
        return res.status(500).json({ error });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: 'Product not found' });
      }

      const product = results[0];
      product.images = product.images ? product.images.split('||') : [];

      res.json(product);
    }
  );
});



// 주문 생성
app.post("/orders", (req, res) => {
  const { product_id, quantity } = req.body;
  db.query(
    "INSERT INTO orders SET ?",
    { product_id, quantity },
    (error, results) => {
      if (error) {
        console.log(error);
        return res.status(500).json({ error });
      }
      res.status(201).json({ order_id: results.insertId });
    }
  );
});
// 카드 리스트 추가
app.post("/cart", authenticateToken, (req, res) => {
    const { productId, productName, price, quantity, size } = req.body;
    const userId = req.user.id;
  
    db.query(
      "INSERT INTO carts SET ?",
      { user_id: userId, product_id: productId, product_name: productName, price: price, quantity: quantity, size: size },
      (error, results) => {
        if (error) {
          console.log(error);
          return res.status(500).send({ message: "Server error" });
        }
  
        res.send({ message: "Product added to cart" });
      }
    );
  });
  
// 카트 리스트 반환
app.get("/cart", authenticateToken, (req, res) => {
    const userId = req.user.id;
  
    db.query(
      "SELECT * FROM carts WHERE user_id = ?",
      [userId],
      (error, results) => {
        if (error) {
          console.log(error);
          return res.status(500).send({ message: "Server error" });
        }
  
        res.send({ cart: results });
      }
    );
  });

  

//카트 삭제
app.delete("/cart/:id", authenticateToken, (req, res) => {
  const cartId = req.params.id;
  const userId = req.user.id;

  db.query(
    "DELETE FROM carts WHERE id = ? AND user_id = ?",
    [cartId, userId],
    (error, results) => {
      if (error) {
        console.log(error);
        return res.status(500).send({ message: "Server error" });
      }

      if (results.affectedRows == 0) {
        return res.status(404).send({ message: "Cart item not found" });
      }

      res.send({ message: "Product removed from cart" });
    }
  );
});

app.listen(3001, () => console.log("Server is running on port 3001"));
