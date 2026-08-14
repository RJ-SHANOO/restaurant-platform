import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { PosLayout } from '@/layouts/PosLayout';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { PLATFORM_NAVIGATION, RESTAURANT_NAVIGATION } from '@/routes/navigation';
import { useAuth } from '@/context/AuthContext';

// Route-level code splitting: the POS bundle never loads for a Super Admin,
// and the platform bundle never loads on a cashier's tablet.
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterRestaurantPage = lazy(() => import('@/pages/auth/RegisterRestaurantPage'));
const PlatformDashboardPage = lazy(() => import('@/pages/platform/PlatformDashboardPage'));
const RestaurantListPage = lazy(() => import('@/pages/platform/RestaurantListPage'));
const RestaurantDashboardPage = lazy(() => import('@/pages/restaurant/RestaurantDashboardPage'));
const BranchListPage = lazy(() => import('@/pages/restaurant/BranchListPage'));
const MenuPage = lazy(() => import('@/pages/restaurant/MenuPage'));
const TablesPage = lazy(() => import('@/pages/restaurant/TablesPage'));
const InventoryPage = lazy(() => import('@/pages/restaurant/InventoryPage'));
const SuppliersPage = lazy(() => import('@/pages/restaurant/SuppliersPage'));
const CustomersPage = lazy(() => import('@/pages/restaurant/CustomersPage'));
const StaffPage = lazy(() => import('@/pages/restaurant/StaffPage'));
const SettingsPage = lazy(() => import('@/pages/restaurant/SettingsPage'));
const PaymentMethodsPage = lazy(() => import('@/pages/restaurant/PaymentMethodsPage'));
const ExpensesPage = lazy(() => import('@/pages/restaurant/ExpensesPage'));
const ReportsPage = lazy(() => import('@/pages/restaurant/ReportsPage'));
const OrderBoardPage = lazy(() => import('@/pages/restaurant/OrderBoardPage'));
const WebsiteEditorPage = lazy(() => import('@/pages/restaurant/WebsiteEditorPage'));
const PosTerminalPage = lazy(() => import('@/pages/pos/PosTerminalPage'));
const KitchenDisplayPage = lazy(() => import('@/pages/kitchen/KitchenDisplayPage'));
const QrMenuPage = lazy(() => import('@/pages/publicsite/QrMenuPage'));
const PublicSitePage = lazy(() => import('@/pages/publicsite/PublicSitePage'));
const ForbiddenPage = lazy(() => import('@/pages/errors/ForbiddenPage'));
const NotFoundPage = lazy(() => import('@/pages/errors/NotFoundPage'));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-void">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-ember" />
    </div>
  );
}

function RestaurantShell() {
  const { user } = useAuth();

  return (
    <DashboardLayout
      sections={RESTAURANT_NAVIGATION}
      contextLabel={user?.scope.branchName ?? user?.scope.restaurantName ?? 'Restaurant'}
    />
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* ------------------------------------------------------- public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterRestaurantPage />} />
        <Route path="/t/:qrToken" element={<QrMenuPage />} />
        <Route path="/site/:slug" element={<PublicSitePage />} />

        {/* ----------------------------------------------------- platform */}
        <Route
          path="/platform"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <DashboardLayout sections={PLATFORM_NAVIGATION} contextLabel="Platform console" />
            </ProtectedRoute>
          }
        >
          <Route index element={<PlatformDashboardPage />} />
          <Route path="restaurants" element={<RestaurantListPage />} />
        </Route>

        {/* --------------------------------------------------- restaurant */}
        <Route
          path="/app"
          element={
            <ProtectedRoute allowedRoles={['restaurant_owner', 'branch_manager']}>
              <RestaurantShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<RestaurantDashboardPage />} />
          <Route path="branches" element={<BranchListPage />} />
          <Route path="menu" element={<MenuPage />} />
          <Route path="tables" element={<TablesPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="payment-methods" element={<PaymentMethodsPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="website" element={<WebsiteEditorPage />} />
          <Route path="orders" element={<OrderBoardPage />} />
        </Route>

        {/* ---------------------------------------------------------- pos */}
        <Route
          path="/pos"
          element={
            <ProtectedRoute requiredPermission="orders.create">
              <PosLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<PosTerminalPage />} />
        </Route>

        {/* ------------------------------------------------------ kitchen */}
        <Route
          path="/kitchen"
          element={
            <ProtectedRoute requiredPermission="kitchen.view">
              <KitchenDisplayPage />
            </ProtectedRoute>
          }
        />

        <Route path="/forbidden" element={<ForbiddenPage />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
