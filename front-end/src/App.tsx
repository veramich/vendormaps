import './App.css';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import BusinessesList from '../pages/BusinessesList';
import AddBusiness from '../pages/AddBusiness';
import BusinessPage from '../pages/BusinessPage';
import UserProfile from '../pages/UserProfile';
import Layout from './Layout';

const routes = [{
  path: '/',
  element: <Layout />,
  children: [{
    path: '/',
    element: <HomePage />,
  },{
    path: '/businesses',
    element: <BusinessesList />
  },{
    path: '/add-business',
    element: <AddBusiness />
  },{
    path: '/business/:id',
    element: <BusinessPage /> 
  },{
    path: '/profile',
    element: <UserProfile />
  }]
}]

const router = createBrowserRouter(routes);

function App() {
  return <RouterProvider router={router} />
}

export default App