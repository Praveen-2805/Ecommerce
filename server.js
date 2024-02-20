const express = require("express");
const mysql = require("mysql");
const fs = require("fs");
const path = require("path");
const app = express();
const port = 5000;
const { Client } = require("@elastic/elasticsearch");
const { CLIENT_RENEG_LIMIT } = require("tls");

const esClient = new Client({
  cloud: {
    id: "Ecommerce:dXMtY2VudHJhbDEuZ2NwLmNsb3VkLmVzLmlvOjQ0MyQ4M2MyOTc2NmEzYTg0ZmZlODkwOTY3YjMxMGEzOGY1OCRiOWM5MzRmY2Q3NmU0NWRiYTEwMGYwOWYwNTQwNDRmZA=="
  },
  auth: {
    username: 'elastic',
    password: 'MZQeVEVvRDGjC1VYGvClrwE7'
  }
})
// Create MySQL connection
const connection = mysql.createConnection({
  host:"sql6.freesqldatabase.com",
  user: "sql6685258",
  password: "IfIVPF9wZD",
  database: "sql6685258"
});

connection.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL database: " + err.stack);
    return;
  }
  console.log("Connected to MySQL database as id " + connection.threadId);
});

app.get("/",(req,res)=>{
  res.sendFile(__dirname+'/public/home.html');
});

app.get("/category/json", (req, res) => {
  let page = parseInt(req.query.page) || 1;
  let limit = 5;
  let offset = (page - 1) * limit;
  let categoryId = req.params.categoryId;
    const query = `SELECT * FROM category LIMIT ${limit} OFFSET ${offset}`;
    connection.query(query, (error, results) => {
      if (error) {
        console.error("Error executing MySQL query: " + error.stack);
        res.status(500).json({ error: "Internal server error" });
        return;
      }

      const countQuery = "SELECT COUNT(*) AS totalCount FROM category";
      connection.query(countQuery, (countError, countResults) => {
        if (countError) {
          console.error("Error executing MySQL query: " + countError.stack);
          res.status(500).json({ error: "Internal server error" });
          return;
        }
        let totalCount = countResults[0].totalCount;
        let totalPages = Math.ceil(totalCount / limit);

        res.json({
          results: results,
          totalPages: totalPages
        });
      });
    });
});

app.get("/category",(req,res)=>{
    res.sendFile(path.join(__dirname,"/public/category_fetch.html"));
});

app.get("/products/0/json",(req,res)=>{
  let page = parseInt(req.query.page) || 1;
  let limit = 10;
  let offset = (page - 1) * limit;
  let countQuery = "SELECT COUNT(*) AS totalCount FROM product";
  let query = `SELECT * FROM product LIMIT ? OFFSET ?`;
  let query2 = `SELECT * FROM category`;
  
  connection.query(countQuery, (countError, countResults) => {
    if (countError) {
        console.error("Error executing MySQL query: " + countError.stack);
        res.status(500).json({ error: "Internal server error" });
        return;
    }
    connection.query(query, [limit, offset], (error, results) => {
      if (error) {
        console.error("Error executing MySQL query: " + error.stack);
        res.status(500).json({ error: "Internal server error" });
        return;
      }
      connection.query(query2, (categoryError, dropdownresults) => {
        if (categoryError) {
          console.error("Error executing MySQL query: " + categoryError.stack);
          res.status(500).json({ error: "Internal server error" });
          return;
        }

        let totalCount = countResults[0].totalCount;
        let totalPages = Math.ceil(totalCount / limit);

        res.json({  results: results, totalPages: totalPages, dropdownresults: dropdownresults,
        });
      });
    });
  });
});


app.get("/searchresults", async (req, res) => {
  let page = parseInt(req.query.page) || 1;
  var query = req.query.query;
  let dropdownOptions = `<option value="1" >Clothing</option><option value="2" >Electronics</option><option value="3" >Books</option><option value="4" >Furniture</option><option value="5" >Toys</option><option value="6" >Gaming</option><option value="7" >Sporting Goods</option><option value="8" >Home Appliances</option><option value="9" >Beauty Products</option><option value="10" >Tools</option><option value="11" >Jewelry</option><option value="12" >Automotive</option><option value="13" >Pet Supplies</option><option value="14" >Music Instruments</option><option value="15" >Office Supplies</option>`;
  var down = ["under", "below", "less", "within", "down", "lesser", "in", "beneath"];
  var eq = ["=", "@", "equals", "equal", "equal to", "at"];
  var up = ["over", "above", "greater", "up", "higher", "beyond", "exceeding", "surpassing", "upwards"];  
  var extra = [",",".","/",":","[","]","rs","Rs", "amt", "Amt", "+", "-", "than","product","category","and"];
  let limit = 5;
  let offset= (page - 1) * limit;
  var string = query.split(" ");
  var cur, sort;
  extra.forEach((val) => {
    if (query.includes(val)) {
      query = query.replace(val, "");
    }
  });

  string.forEach((val) => {
    if (down.includes(val)) {
      cur = val;
      sort = "lte";
      return;
    } else if (up.includes(val)) {
      cur = val;
      sort = "gte";
      return;
    } else if (eq.includes(val)) {
      cur = val;
      sort = "eq";
      return;
    }
  });

  if (cur) {
    var [data, price] = query.split(cur);
    var value = parseFloat(price);
  } else {
    var data = query;
    var value = 10000000;
    sort = "lte";
  }

  try {
    let body = await esClient.search({
      index: "product_index",
      body: {
        query: {
          bool: {
            must: [
              {
                exists: {
                  field: "discounted_price",
                },
              },
              {
                range: {
                  discounted_price: {[sort]: value,lte:100000000,
                  },
                },
              },
            ],
            should: [
              {
                multi_match: { 
                  query: data, 
                  fields: ["product_name", "brand^3", "category_name"], 
                },
              },
            ],
            minimum_should_match: 1,
          },
        },
        _source: ["product_id","product_name","brand","price","discounted_price", "created_date","category_name"], 
        size: limit,
        from: offset  },
    });

    if (body && body.hits) { // Check if hits exist and total hits count is greater than 0
      let totalHits = body.hits.total.value; 
      let totalPages = Math.ceil(totalHits / limit);
      let data = body.hits.hits;
      let results = data.map((hit) => hit._source);
      res.json({results:results,totalPages:totalPages,dropdownOptions:dropdownOptions});
    }
   } catch (error) {
      console.error("Error executing Elasticsearch query:", error);
      res.status(500).send("Internal Server Error");
    }
  });

app.get("/suma",async(req,res)=>{
  // const data=await esClient.

  await esClient.indices.create({ index: 'my_index' })
  
  
  res.send("done")
})

app.get('/search',(req,res)=>{
    res.sendFile(__dirname+'/public/search_results.html');
  })
app.get("/products/:categoryId/json", (req, res) => {
  const categoryId = req.params.categoryId;
  const page = parseInt(req.query.page) || 1;
  const limit = 5;
  const offset = (page - 1) * limit;

  const query = `SELECT * FROM product WHERE category_id = ? LIMIT ? OFFSET ?`;
  connection.query(query, [categoryId, limit, offset], (error, results) => {
    if (error) {
      console.error("Error executing MySQL query: " + error.stack);
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    const countQuery = `SELECT COUNT(*) AS totalCount FROM product WHERE category_id = ?`;
    connection.query(countQuery, [categoryId], (countError, countResults) => {
      if (countError) {
        console.error("Error executing MySQL query: " + countError.stack);
        res.status(500).json({ error: "Internal server error" });
        return;
      }
      const query2 = `SELECT * FROM category`;
      connection.query(query2, (categoryError, dropdownresults) => {
        if (categoryError) {
          console.error("Error executing MySQL query: " + categoryError.stack);
          res.status(500).json({ error: "Internal server error" });
          return;
        }

      let totalCount = countResults[0].totalCount;
      let totalPages = Math.ceil(totalCount / limit);
      res.json({
        results: results,
        totalPages: totalPages,
        dropdownresults: dropdownresults});
    });
  });
});
});

app.get("/products/:categoryId",(req,res)=>{
      res.sendFile(path.join(__dirname,"./public/product_fetch.html"));
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});