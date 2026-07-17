const express = require('express');
const path = require('path');
const methodOverride = require('method-override');
const session = require('express-session');
const flash = require('connect-flash');
const { readDB, writeDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'inventory-secret-key',
  resave: false,
  saveUninitialized: true
}));
app.use(flash());

app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

// ---------- Helpers ----------
function withCategoryName(item, categories) {
  const cat = categories.find(c => c.id === item.categoryId);
  return { ...item, categoryName: cat ? cat.name : 'Uncategorized' };
}

// ---------- Dashboard ----------
app.get('/', (req, res) => {
  const db = readDB();
  const totalItems = db.items.length;
  const totalUnits = db.items.reduce((sum, i) => sum + Number(i.quantity), 0);
  const totalValue = db.items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.price), 0);
  const lowStock = db.items.filter(i => Number(i.quantity) <= Number(i.reorderLevel))
    .map(i => withCategoryName(i, db.categories));

  res.render('index', {
    title: 'Dashboard',
    totalItems,
    totalUnits,
    totalValue,
    lowStock,
    categoryCount: db.categories.length
  });
});

// ---------- Items ----------
app.get('/items', (req, res) => {
  const db = readDB();
  const { q, category, stock } = req.query;

  let items = db.items.map(i => withCategoryName(i, db.categories));

  if (q) {
    const term = q.toLowerCase();
    items = items.filter(i =>
      i.name.toLowerCase().includes(term) || i.sku.toLowerCase().includes(term)
    );
  }
  if (category) {
    items = items.filter(i => i.categoryId === Number(category));
  }
  if (stock === 'low') {
    items = items.filter(i => Number(i.quantity) <= Number(i.reorderLevel));
  }

  res.render('items', {
    title: 'Inventory Items',
    items,
    categories: db.categories,
    query: { q: q || '', category: category || '', stock: stock || '' }
  });
});

app.get('/items/new', (req, res) => {
  const db = readDB();
  res.render('item-form', {
    title: 'Add New Item',
    item: null,
    categories: db.categories,
    formAction: '/items',
    formMethod: 'POST'
  });
});

app.post('/items', (req, res) => {
  const db = readDB();
  const { name, sku, categoryId, quantity, price, reorderLevel } = req.body;

  if (!name || !sku) {
    req.flash('error', 'Name and SKU are required.');
    return res.redirect('/items/new');
  }

  const newItem = {
    id: db.nextItemId,
    name: name.trim(),
    sku: sku.trim(),
    categoryId: Number(categoryId),
    quantity: Number(quantity) || 0,
    price: Number(price) || 0,
    reorderLevel: Number(reorderLevel) || 0
  };

  db.items.push(newItem);
  db.nextItemId += 1;
  writeDB(db);

  req.flash('success', `"${newItem.name}" was added to inventory.`);
  res.redirect('/items');
});

app.get('/items/:id/edit', (req, res) => {
  const db = readDB();
  const item = db.items.find(i => i.id === Number(req.params.id));
  if (!item) {
    req.flash('error', 'Item not found.');
    return res.redirect('/items');
  }
  res.render('item-form', {
    title: 'Edit Item',
    item,
    categories: db.categories,
    formAction: `/items/${item.id}?_method=PUT`,
    formMethod: 'POST'
  });
});

app.put('/items/:id', (req, res) => {
  const db = readDB();
  const idx = db.items.findIndex(i => i.id === Number(req.params.id));
  if (idx === -1) {
    req.flash('error', 'Item not found.');
    return res.redirect('/items');
  }

  const { name, sku, categoryId, quantity, price, reorderLevel } = req.body;
  db.items[idx] = {
    ...db.items[idx],
    name: name.trim(),
    sku: sku.trim(),
    categoryId: Number(categoryId),
    quantity: Number(quantity) || 0,
    price: Number(price) || 0,
    reorderLevel: Number(reorderLevel) || 0
  };
  writeDB(db);

  req.flash('success', `"${db.items[idx].name}" was updated.`);
  res.redirect('/items');
});

app.delete('/items/:id', (req, res) => {
  const db = readDB();
  const item = db.items.find(i => i.id === Number(req.params.id));
  db.items = db.items.filter(i => i.id !== Number(req.params.id));
  writeDB(db);

  req.flash('success', item ? `"${item.name}" was removed.` : 'Item removed.');
  res.redirect('/items');
});

// ---------- Categories ----------
app.get('/categories', (req, res) => {
  const db = readDB();
  const categories = db.categories.map(c => ({
    ...c,
    itemCount: db.items.filter(i => i.categoryId === c.id).length
  }));
  res.render('categories', { title: 'Categories', categories });
});

app.post('/categories', (req, res) => {
  const db = readDB();
  const { name } = req.body;
  if (!name || !name.trim()) {
    req.flash('error', 'Category name is required.');
    return res.redirect('/categories');
  }
  db.categories.push({ id: db.nextCategoryId, name: name.trim() });
  db.nextCategoryId += 1;
  writeDB(db);
  req.flash('success', `Category "${name.trim()}" created.`);
  res.redirect('/categories');
});

app.delete('/categories/:id', (req, res) => {
  const db = readDB();
  const catId = Number(req.params.id);
  const inUse = db.items.some(i => i.categoryId === catId);
  if (inUse) {
    req.flash('error', 'Cannot delete a category that still has items assigned to it.');
    return res.redirect('/categories');
  }
  db.categories = db.categories.filter(c => c.id !== catId);
  writeDB(db);
  req.flash('success', 'Category deleted.');
  res.redirect('/categories');
});

app.listen(PORT, () => {
  console.log(`Inventory Management System running at http://localhost:${PORT}`);
});
