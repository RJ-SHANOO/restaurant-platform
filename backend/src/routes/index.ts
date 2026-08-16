import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireTenant } from '../middleware/authenticate';
import { requirePermission, requirePlatformAdmin } from '../middleware/authorise';

import { authController } from '../controllers/authController';
import { branchController } from '../controllers/branchController';
import { customerController } from '../controllers/customerController';
import { inventoryController } from '../controllers/inventoryController';
import { menuController } from '../controllers/menuController';
import { expenseController } from '../controllers/expenseController';
import { orderController } from '../controllers/orderController';
import { paymentMethodController } from '../controllers/paymentMethodController';
import { purchaseController } from '../controllers/purchaseController';
import { reportController } from '../controllers/reportController';
import { supplierController } from '../controllers/supplierController';
import { tableController } from '../controllers/tableController';
import { kitchenController } from '../controllers/kitchenController';
import { billingController } from '../controllers/billingController';
import { websiteController } from '../controllers/websiteController';
import { platformController } from '../controllers/platformController';
import { qrController } from '../controllers/qrController';
import { settingsController } from '../controllers/settingsController';
import { uploadController } from '../controllers/uploadController';
import { staffController } from '../controllers/staffController';

/**
 * Three tiers, in order of how much trust each requires:
 *
 *   /public     no token at all - login, registration, QR ordering, public sites
 *   (tenant)    a signed-in user, scoped to one restaurant
 *   /platform   a Super Admin, reading across every restaurant
 */

const router = Router();

// ---------------------------------------------------------------- public tier

const publicRoutes = Router();

const loginLimit = rateLimit({ windowMs: 60_000, limit: 8, standardHeaders: true });
const registerLimit = rateLimit({ windowMs: 10 * 60_000, limit: 5 });
const qrOrderLimit = rateLimit({ windowMs: 60_000, limit: 12 });

publicRoutes.post('/auth/login', loginLimit, authController.login);
publicRoutes.post('/auth/register-restaurant', registerLimit, authController.registerRestaurant);
publicRoutes.get('/platform-terms', authController.platformTerms);

publicRoutes.get('/sites/:slug', websiteController.publicSite);

publicRoutes.get('/qr/:qrToken', qrController.resolve);
publicRoutes.post('/qr/:qrToken/orders', qrOrderLimit, qrController.placeOrder);

router.use('/public', publicRoutes);

// ---------------------------------------------------------------- tenant tier

router.use(authenticate);

router.get('/me', authController.me);
router.post('/auth/logout', authController.logout);

const tenant = Router();
tenant.use(requireTenant);

// Branches
tenant.get('/branches', requirePermission('branches.view'), branchController.index);
tenant.post('/branches', requirePermission('branches.create'), branchController.store);
tenant.get('/branches/:id', requirePermission('branches.view'), branchController.show);
tenant.put('/branches/:id', requirePermission('branches.update'), branchController.update);
tenant.delete('/branches/:id', requirePermission('branches.delete'), branchController.destroy);

// Menu
tenant.get('/menu/categories', requirePermission('menu.view'), menuController.categoryIndex);
tenant.post('/menu/categories', requirePermission('menu.create'), menuController.categoryStore);
tenant.put('/menu/categories/:id', requirePermission('menu.update'), menuController.categoryUpdate);
tenant.delete('/menu/categories/:id', requirePermission('menu.delete'), menuController.categoryDestroy);

tenant.get('/menu/products', requirePermission('menu.view'), menuController.productIndex);
tenant.get('/menu/products/:id', requirePermission('menu.view'), menuController.productShow);
tenant.post('/menu/products', requirePermission('menu.create'), menuController.productStore);
tenant.put('/menu/products/:id', requirePermission('menu.update'), menuController.productUpdate);
tenant.delete('/menu/products/:id', requirePermission('menu.delete'), menuController.productDestroy);

tenant.get('/menu/modifier-groups', requirePermission('menu.view'), menuController.modifierGroupIndex);
tenant.post('/menu/modifier-groups', requirePermission('menu.create'), menuController.modifierGroupStore);
tenant.put('/menu/modifier-groups/:id', requirePermission('menu.update'), menuController.modifierGroupUpdate);
tenant.delete('/menu/modifier-groups/:id', requirePermission('menu.delete'), menuController.modifierGroupDestroy);

// Orders
tenant.get('/orders', requirePermission('orders.view'), orderController.index);
tenant.post('/orders', requirePermission('orders.create'), orderController.store);
tenant.get('/orders/:id', requirePermission('orders.view'), orderController.show);
tenant.post('/orders/:id/transition', orderController.transition);

// Billing
tenant.post('/orders/:orderId/invoice', requirePermission('billing.issue'), billingController.issueInvoice);
tenant.get('/invoices/:invoiceId', requirePermission('billing.view'), billingController.show);
tenant.post('/invoices/:invoiceId/payments', requirePermission('billing.collect'), billingController.recordPayment);
tenant.post('/invoices/:invoiceId/refunds', requirePermission('billing.refund'), billingController.issueRefund);

// Inventory
tenant.get('/inventory/items', requirePermission('inventory.view'), inventoryController.itemIndex);
tenant.post('/inventory/items', requirePermission('inventory.adjust'), inventoryController.itemStore);
tenant.put('/inventory/items/:id', requirePermission('inventory.adjust'), inventoryController.itemUpdate);
tenant.delete('/inventory/items/:id', requirePermission('inventory.adjust'), inventoryController.itemDestroy);
tenant.get('/inventory/levels', requirePermission('inventory.view'), inventoryController.levels);
tenant.get('/inventory/transactions', requirePermission('inventory.view'), inventoryController.transactions);
tenant.get('/inventory/low-stock', requirePermission('inventory.view'), inventoryController.lowStock);
tenant.post('/inventory/adjustments', requirePermission('inventory.adjust'), inventoryController.adjust);

// Customers
tenant.get('/customers', requirePermission('customers.view'), customerController.index);
tenant.post('/customers', requirePermission('customers.create'), customerController.store);
tenant.get('/customers/:id', requirePermission('customers.view'), customerController.show);
tenant.put('/customers/:id', requirePermission('customers.update'), customerController.update);
tenant.delete('/customers/:id', requirePermission('customers.delete'), customerController.destroy);

// Suppliers
tenant.get('/suppliers', requirePermission('inventory.view'), supplierController.index);
tenant.post('/suppliers', requirePermission('inventory.purchase'), supplierController.store);
tenant.put('/suppliers/:id', requirePermission('inventory.purchase'), supplierController.update);
tenant.delete('/suppliers/:id', requirePermission('inventory.purchase'), supplierController.destroy);

// Purchases
tenant.get('/purchases', requirePermission('inventory.view'), purchaseController.index);
tenant.post('/purchases', requirePermission('inventory.purchase'), purchaseController.store);
tenant.post('/purchases/:id/receive', requirePermission('inventory.purchase'), purchaseController.receive);
tenant.post('/purchases/:id/cancel', requirePermission('inventory.purchase'), purchaseController.cancel);

// Kitchen
tenant.get('/kitchen/board', requirePermission('kitchen.view'), kitchenController.board);
tenant.patch('/kitchen/tickets/:id/status', requirePermission('kitchen.updateStatus'), kitchenController.updateStatus);
tenant.get('/kitchen/tickets/:id/print-payload', requirePermission('kitchen.view'), kitchenController.printPayload);

// Payment methods
tenant.get('/payment-methods', requirePermission('settings.view'), paymentMethodController.index);
tenant.post('/payment-methods', requirePermission('settings.update'), paymentMethodController.store);
tenant.put('/payment-methods/:id', requirePermission('settings.update'), paymentMethodController.update);
tenant.delete('/payment-methods/:id', requirePermission('settings.update'), paymentMethodController.destroy);

// Expenses
tenant.get('/expenses', requirePermission('expenses.view'), expenseController.index);
tenant.post('/expenses', requirePermission('expenses.record'), expenseController.store);
tenant.put('/expenses/:id', requirePermission('expenses.record'), expenseController.update);
tenant.delete('/expenses/:id', requirePermission('expenses.record'), expenseController.destroy);

// Reports
tenant.get('/reports/summary', requirePermission('reports.view'), reportController.summary);
tenant.get('/reports/revenue-by-day', requirePermission('reports.view'), reportController.revenueByDay);
tenant.get('/reports/top-items', requirePermission('reports.view'), reportController.topItems);
tenant.get('/reports/payment-breakdown', requirePermission('reports.view'), reportController.paymentBreakdown);

// The restaurant's own website
tenant.get('/website', requirePermission('website.view'), websiteController.show);
tenant.put('/website', requirePermission('website.update'), websiteController.updateTheme);
tenant.patch('/website/published', requirePermission('website.update'), websiteController.setPublished);

// Image uploads (returns a URL; saving it is the target resource's job)
tenant.post('/uploads', uploadController.store);

// Settings (the restaurant's own profile)
tenant.get('/settings', requirePermission('settings.view'), settingsController.show);
tenant.put('/settings', requirePermission('settings.update'), settingsController.update);

// Staff and roles
tenant.get('/staff', requirePermission('staff.view'), staffController.index);
tenant.post('/staff', requirePermission('staff.create'), staffController.store);
tenant.put('/staff/:id', requirePermission('staff.update'), staffController.update);
tenant.delete('/staff/:id', requirePermission('staff.delete'), staffController.destroy);
tenant.get('/roles', requirePermission('staff.view'), staffController.roles);

// Tables
tenant.get('/tables', requirePermission('tables.view'), tableController.index);
tenant.post('/tables', requirePermission('tables.create'), tableController.store);
tenant.put('/tables/:id', requirePermission('tables.update'), tableController.update);
tenant.delete('/tables/:id', requirePermission('tables.update'), tableController.destroy);
tenant.post('/tables/:id/rotate-qr', requirePermission('tables.update'), qrController.rotateToken);

// -------------------------------------------------------------- platform tier

const platform = Router();
platform.use(requirePlatformAdmin);

platform.get('/dashboard', platformController.dashboard);
platform.post('/restaurants', platformController.store);
platform.get('/restaurants', platformController.restaurants);
platform.get('/restaurants/:id', platformController.show);
platform.patch('/restaurants/:id/commercial-terms', platformController.updateCommercialTerms);
platform.patch('/restaurants/:id/status', platformController.updateStatus);
platform.post('/restaurants/:id/settle', platformController.runSettlement);
platform.get('/settlements', platformController.settlements);
platform.get('/commission', platformController.commission);
platform.get('/activity', platformController.activity);

// Mounted before `tenant` below: tenant's requireTenant middleware has no
// path restriction of its own, so it would otherwise catch every request -
// including /platform/* - and reject a Super Admin who hasn't sent
// X-View-Restaurant-Id, before the request ever reached this router.
router.use('/platform', platform);

router.use(tenant);

export default router;
