# Order Management PWA

A Progressive Web App for managing sand orders with mobile-first design.

## Features

- 📊 **Dashboard**: View statistics including total weight, cost, profit, and balance
- 📦 **Order Management**: Add, edit, delete orders with all required attributes
- 💰 **Payment Tracking**: Mark orders as paid, track payment due
- 📄 **PDF Invoices**: Generate single or multiple PDF invoices
- 🔍 **Advanced Filtering**: Filter by party name, date range, material, truck details
- 📱 **Mobile-First**: Optimized for iPhone and Android devices

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use an existing one
3. Enable Firestore Database
4. Go to Project Settings > General
5. Copy your Firebase configuration

### 3. Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 4. Firestore Security Rules

In Firebase Console, go to Firestore Database > Rules and set:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /orders/{document=**} {
      allow read, write: if true; // For development - restrict in production
    }
  }
}
```

**Note**: For production, implement proper authentication and security rules.

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Build for Production

```bash
npm run build
npm start
```

## Order Attributes

Each order contains:
- Date
- Party Name
- Site Name
- Material
- Weight
- Rate
- Total (calculated: Weight × Rate)
- Truck Owner
- Truck No
- Original Weight
- Original Rate
- Original Total (calculated: Original Weight × Original Rate)
- Additional Cost
- Profit (calculated: Total - (Original Total + Additional Cost))
- Payment Due status

## Usage

### Dashboard
- View current month statistics
- Filter by duration (7 days, last month, 3 months, 6 months, last year)
- Filter by party name and date range

### Orders
- **Latest Tab**: View all orders sorted by date
- **Payment Due Tab**: View only unpaid orders
- Add new orders with the form
- Edit existing orders
- Delete orders (with confirmation)
- Mark orders as paid
- Generate PDF invoices (single or multiple)
- Filter orders by all attributes

## PWA Installation

On mobile devices:
1. Open the app in your browser
2. Look for "Add to Home Screen" option
3. Install the app for offline access

## Technologies Used

- Next.js 14
- React 18
- TypeScript
- Firebase Firestore
- Tailwind CSS
- jsPDF
- date-fns
- Lucide React Icons

## License

MIT

