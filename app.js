// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyBX9yN_k9Qk78QTVQdSgqf5abLGJTr5rHg",
    authDomain: "safariataljanoub.firebaseapp.com",
    projectId: "safariataljanoub",
    storageBucket: "safariataljanoub.firebasestorage.app",
    messagingSenderId: "798760341428",
    appId: "1:798760341428:android:b4a5e7908032b002e1ece1"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// Application State
let currentUser = null;
let currentUserProfile = null;
let isAdminUser = false;
let activeTrips = [];
let myBookings = [];
let myRequests = [];
let rideRequests = [];
let reviews = [];
let allUsers = [];
let currentBookingTrip = null;

// ==================== INITIALIZATION & AUTH LISTENERS ====================
window.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    listenToAppSettings();

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            const email = user.email ? user.email.toLowerCase() : "";
            isAdminUser = (email === "abstarking@gmail.com");

            await fetchUserProfile(user.uid, email, user.displayName);

            updateUIAfterAuth(true);
            listenToRealtimeData();
        } else {
            currentUser = null;
            currentUserProfile = null;
            isAdminUser = false;
            updateUIAfterAuth(false);
            listenToPublicTrips();
            listenToReviews();
        }
    });
});

async function fetchUserProfile(uid, email, displayName) {
    try {
        const userRef = db.collection("users").doc(uid);
        const docSnap = await userRef.get();

        if (docSnap.exists) {
            currentUserProfile = docSnap.data();
        } else {
            currentUserProfile = {
                uid: uid,
                email: email,
                name: displayName || (isAdminUser ? "أدمن التطبيق" : "مستخدم جديد"),
                role: isAdminUser ? "both" : "passenger",
                isDriverApproved: isAdminUser,
                isActive: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await userRef.set(currentUserProfile, { merge: true });
        }

        if (isAdminUser) {
            const adminRef = db.collection("admins").doc(uid);
            await adminRef.set({ email: email, role: "admin" }, { merge: true });
        }
    } catch (e) {
        console.error("Error fetching profile:", e);
    }
}

function updateUIAfterAuth(isLoggedIn) {
    const loggedOutEl = document.getElementById('userLoggedOut');
    const loggedInEl = document.getElementById('userLoggedIn');
    const userGreeting = document.getElementById('userGreeting');

    if (isLoggedIn) {
        loggedOutEl.classList.add('hidden');
        loggedInEl.classList.remove('hidden');
        userGreeting.textContent = `مرحباً، ${currentUserProfile ? currentUserProfile.name : ''}`;

        if (isAdminUser) {
            document.getElementById('regularUserHome').classList.add('hidden');
            document.getElementById('adminDashboardHome').classList.remove('hidden');
        } else {
            document.getElementById('regularUserHome').classList.remove('hidden');
            document.getElementById('adminDashboardHome').classList.add('hidden');

            const isDriver = currentUserProfile && (currentUserProfile.role === 'driver' || currentUserProfile.role === 'both');
            document.querySelectorAll('.driver-only').forEach(el => {
                if (isDriver) el.classList.remove('hidden'); else el.classList.add('hidden');
            });
        }
    } else {
        loggedOutEl.classList.remove('hidden');
        loggedInEl.classList.add('hidden');
        document.getElementById('regularUserHome').classList.remove('hidden');
        document.getElementById('adminDashboardHome').classList.add('hidden');
        document.querySelectorAll('.driver-only').forEach(el => el.classList.add('hidden'));
    }
}

function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const viewId = btn.getAttribute('data-view');
            switchView(viewId);
        });
    });
}

window.switchView = function(viewId) {
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.add('hidden'));
    const target = document.getElementById(viewId);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-view') === viewId);
    });

    if (viewId === 'searchTripsView') renderTrips();
    if (viewId === 'myBookingsView') renderMyBookings();
    if (viewId === 'myRequestsView') renderMyRequests();
    if (viewId === 'driverRequestsView') renderDriverRequests();
    if (viewId === 'reviewsView') renderReviews();
    if (viewId === 'adminUsersView') renderAdminUsers();
    if (viewId === 'adminReviewsView') renderAdminReviews();
};

window.openProfileView = function() {
    if (!currentUserProfile) return;
    alert(`الملف الشخصي:\nالاسم: ${currentUserProfile.name}\nالبريد: ${currentUserProfile.email}\nرقم الهاتف: ${currentUserProfile.phone || 'غير مسجل'}\nالدور: ${currentUserProfile.role}`);
};

// ==================== LISTENERS ====================
function listenToAppSettings() {
    db.collection("app_settings").doc("general").onSnapshot((snapshot) => {
        if (snapshot.exists) {
            const settings = snapshot.data();
            const banner = document.getElementById('maintenanceBanner');
            const bannerText = document.getElementById('maintenanceBannerText');

            if (settings.isMaintenanceMode) {
                banner.classList.remove('hidden');
                bannerText.textContent = settings.maintenanceMessage || "التطبيق تحت الصيانة حالياً، نعود قريباً";
            } else {
                banner.classList.add('hidden');
            }

            document.getElementById('setMaintenanceMode').checked = settings.isMaintenanceMode || false;
            document.getElementById('setMaintenanceMessage').value = settings.maintenanceMessage || "";
            document.getElementById('setAllowRegistrations').checked = settings.allowNewRegistrations !== false;
            document.getElementById('setAllowTrips').checked = settings.allowNewTrips !== false;
        }
    });
}

function listenToPublicTrips() {
    db.collection("trips").onSnapshot((snapshot) => {
        activeTrips = snapshot.docs
            .map(doc => ({ tripId: doc.id, ...doc.data() }))
            .filter(t => t.status === "active" || !t.status);
        renderTrips();
    });
}

function listenToReviews() {
    db.collection("reviews").onSnapshot((snapshot) => {
        reviews = snapshot.docs.map(doc => ({ reviewId: doc.id, ...doc.data() }));
        renderReviews();
        if (isAdminUser) renderAdminReviews();
    });
}

function listenToRealtimeData() {
    listenToPublicTrips();
    listenToReviews();

    if (currentUser) {
        db.collection("bookings").where("passengerId", "==", currentUser.uid).onSnapshot((snapshot) => {
            myBookings = snapshot.docs.map(doc => ({ bookingId: doc.id, ...doc.data() }));
            renderMyBookings();
        });

        db.collection("ride_requests").where("passengerId", "==", currentUser.uid).onSnapshot((snapshot) => {
            myRequests = snapshot.docs.map(doc => ({ requestId: doc.id, ...doc.data() }));
            renderMyRequests();
        });
    }

    db.collection("ride_requests").onSnapshot((snapshot) => {
        rideRequests = snapshot.docs
            .map(doc => ({ requestId: doc.id, ...doc.data() }))
            .filter(r => r.status === "open" || !r.status || (r.status === "accepted" && r.acceptedByDriverId === currentUser?.uid));
        renderDriverRequests();
    });

    if (isAdminUser) {
        db.collection("users").onSnapshot((snapshot) => {
            allUsers = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
            renderAdminUsers();
        });
    }
}

// ==================== RENDERING ====================
function renderTrips() {
    const container = document.getElementById('tripsList');
    if (!container) return;
    const fromCity = document.getElementById('filterFromCity').value;
    const toCity = document.getElementById('filterToCity').value;

    let filtered = activeTrips.filter(t => {
        let matchFrom = !fromCity || t.fromCity === fromCity;
        let matchTo = !toCity || t.toCity === toCity;
        return matchFrom && matchTo;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<p class="alert">لا توجد رحلات معروضة حالياً طابق فلتر البحث.</p>`;
        return;
    }

    container.innerHTML = filtered.map(t => `
        <div class="trip-card">
            <div class="trip-header">
                <span class="route-title">${t.fromCity} ← ${t.toCity}</span>
                <span class="badge badge-success">${t.price} دج</span>
            </div>
            <div class="trip-body">
                <p><i class="fa-solid fa-user-driver"></i> السائق: <strong>${t.driverName || 'سائق'}</strong></p>
                <p><i class="fa-solid fa-chair"></i> المقاعد المتاحة: <strong>${t.availableSeats} من ${t.totalSeats}</strong></p>
                <p><i class="fa-solid fa-phone"></i> الهاتف: ${t.driverPhone || 'غير مسجل'}</p>
                ${t.notes ? `<p><i class="fa-solid fa-info-circle"></i> ${t.notes}</p>` : ''}
            </div>
            <div class="trip-actions">
                ${currentUser && t.driverId === currentUser.uid ? `
                    <button class="btn btn-danger btn-block" onclick="deleteMyTrip('${t.tripId}')">
                        <i class="fa-solid fa-trash"></i> حذف رحلتي
                    </button>
                ` : `
                    <button class="btn btn-primary btn-block" onclick="openBookingModal('${t.tripId}')">
                        <i class="fa-solid fa-ticket"></i> احجز مقعد الآن
                    </button>
                `}
            </div>
        </div>
    `).join('');
}

function renderMyBookings() {
    const container = document.getElementById('bookingsList');
    if (!container) return;
    if (!currentUser) {
        container.innerHTML = `<p class="alert">سجل الدخول لعرض حجوزاتك.</p>`;
        return;
    }

    if (myBookings.length === 0) {
        container.innerHTML = `<p class="alert">لا توجد لديك حجوزات حالية.</p>`;
        return;
    }

    container.innerHTML = myBookings.map(b => `
        <div class="item-card">
            <div class="trip-header">
                <span>حجز #${b.bookingId.substring(0, 6)}</span>
                <span class="badge ${b.status === 'confirmed' ? 'badge-success' : 'badge-warning'}">${b.status === 'confirmed' ? 'مؤكد ✓' : 'في الانتظار ⏳'}</span>
            </div>
            <p>عدد المقاعد المحجوزة: <strong>${b.seatsBooked}</strong></p>
            <p>إجمالي السعر: <strong>${b.totalPrice} دج</strong></p>
        </div>
    `).join('');
}

function renderMyRequests() {
    const container = document.getElementById('myRequestsList');
    if (!container) return;
    if (!currentUser) {
        container.innerHTML = `<p class="alert">سجل الدخول لعرض طلباتك.</p>`;
        return;
    }

    if (myRequests.length === 0) {
        container.innerHTML = `<p class="alert">لا توجد لديك طلبات رحلات حالية.</p>`;
        return;
    }

    container.innerHTML = myRequests.map(r => `
        <div class="item-card">
            <div class="trip-header">
                <span class="route-title">${r.fromCity} ← ${r.toCity}</span>
                <span class="badge ${r.status === 'accepted' ? 'badge-success' : 'badge-warning'}">${r.status === 'accepted' ? 'تم قبوله من سائق ✓' : 'في الانتظار ⏳'}</span>
            </div>
            <p>المقاعد المطلوبة: <strong>${r.seatsNeeded}</strong></p>
            ${r.notes ? `<p><i class="fa-solid fa-note-sticky"></i> ${r.notes}</p>` : ''}
            <div class="trip-actions">
                <button class="btn btn-danger btn-block" onclick="deleteMyRequest('${r.requestId}')">
                    <i class="fa-solid fa-trash"></i> حذف الطلب
                </button>
            </div>
        </div>
    `).join('');
}

window.deleteMyRequest = async function(requestId) {
    if (!confirm("هل أنت تأكد من إرادة حذف هذا الطلب؟")) return;
    try {
        await db.collection("ride_requests").doc(requestId).delete();
        alert("تم حذف الطلب بنجاح ✓");
    } catch (e) {
        alert("فشل حذف الطلب: " + e.message);
    }
};

window.deleteMyTrip = async function(tripId) {
    if (!confirm("هل أنت تأكد من إرادة حذف هذه الرحلة؟")) return;
    try {
        await db.collection("trips").doc(tripId).delete();
        alert("تم حذف الرحلة بنجاح ✓");
    } catch (e) {
        alert("فشل حذف الرحلة: " + e.message);
    }
};

function renderDriverRequests() {
    const container = document.getElementById('driverRequestsList');
    if (!container) return;
    if (rideRequests.length === 0) {
        container.innerHTML = `<p class="alert">لا توجد طلبات رحلات مفتوحة حالياً.</p>`;
        return;
    }

    container.innerHTML = rideRequests.map(r => `
        <div class="item-card">
            <div class="trip-header">
                <span class="route-title">${r.fromCity} ← ${r.toCity}</span>
                <span class="badge badge-warning">${r.seatsNeeded} مقاعد</span>
            </div>
            <p><i class="fa-solid fa-user"></i> الراكب: ${r.passengerName}</p>
            <p><i class="fa-solid fa-phone"></i> الهاتف: ${r.passengerPhone}</p>
            ${r.notes ? `<p><i class="fa-solid fa-note-sticky"></i> ${r.notes}</p>` : ''}
            <div class="trip-actions">
                <button class="btn btn-secondary btn-block" onclick="acceptRideRequest('${r.requestId}')">
                    <i class="fa-solid fa-check"></i> قبول الطلب
                </button>
            </div>
        </div>
    `).join('');
}

function renderReviews() {
    const container = document.getElementById('reviewsList');
    if (!container) return;
    let visibleReviews = reviews.filter(r => r.isVisible !== false);

    if (visibleReviews.length === 0) {
        container.innerHTML = `<p class="alert">لا توجد تقييمات حالياً.</p>`;
        return;
    }

    container.innerHTML = visibleReviews.map(r => `
        <div class="item-card">
            <div class="trip-header">
                <strong>${r.userName || 'مستخدم'}</strong>
                <span>${'⭐'.repeat(r.rating || 5)}</span>
            </div>
            <p>"${r.comment || ''}"</p>
        </div>
    `).join('');
}

function renderAdminUsers() {
    const container = document.getElementById('adminUsersList');
    if (!container) return;

    document.getElementById('statTotalUsers').textContent = allUsers.length;
    document.getElementById('statApprovedDrivers').textContent = allUsers.filter(u => u.isDriverApproved).length;
    document.getElementById('statDisabledUsers').textContent = allUsers.filter(u => u.isActive === false).length;

    container.innerHTML = allUsers.map(u => `
        <div class="item-card">
            <div class="trip-header">
                <strong>${u.name || 'مستخدم'}</strong>
                <span class="badge ${u.isActive !== false ? 'badge-success' : 'badge-danger'}">${u.isActive !== false ? 'حساب نشط' : 'معطل'}</span>
            </div>
            <p>البريد/الهاتف: ${u.email || u.phone || 'غير مسجل'}</p>
            <p>الدور: ${u.role === 'driver' ? 'سائق' : u.role === 'passenger' ? 'راكب' : 'راكب وسائق'}</p>
            <p>حالة الاعتماد: <strong>${u.isDriverApproved ? 'معتمد ✓' : 'غير معتمد ⏳'}</strong></p>
            <div class="trip-actions">
                <button class="btn ${u.isDriverApproved ? 'btn-outline' : 'btn-primary'}" onclick="toggleDriverApproval('${u.uid}', ${!u.isDriverApproved})">
                    ${u.isDriverApproved ? 'إلغاء الاعتماد' : 'اعتماد السائق'}
                </button>
                <button class="btn ${u.isActive !== false ? 'btn-danger' : 'btn-secondary'}" onclick="toggleUserActiveStatus('${u.uid}', ${u.isActive === false})">
                    ${u.isActive !== false ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                </button>
            </div>
        </div>
    `).join('');
}

function renderAdminReviews() {
    const container = document.getElementById('adminReviewsList');
    if (!container) return;

    container.innerHTML = reviews.map(r => `
        <div class="item-card">
            <div class="trip-header">
                <strong>${r.userName || 'مستخدم'}</strong>
                <span class="badge ${r.isVisible !== false ? 'badge-success' : 'badge-warning'}">${r.isVisible !== false ? 'ظاهر للعموم' : 'مخفي'}</span>
            </div>
            <p>${'⭐'.repeat(r.rating || 5)}</p>
            <p>"${r.comment || ''}"</p>
            <div class="trip-actions">
                <button class="btn btn-outline" onclick="toggleReviewVisibility('${r.reviewId}', ${r.isVisible === false})">
                    ${r.isVisible !== false ? 'إخفاء التقييم' : 'إظهار التقييم'}
                </button>
                <button class="btn btn-danger" onclick="deleteReview('${r.reviewId}')">حذف</button>
            </div>
        </div>
    `).join('');
}

// ==================== AUTH ACTIONS ====================
window.openModal = function(id) {
    document.getElementById(id).classList.remove('hidden');
};

window.closeModal = function(id) {
    document.getElementById(id).classList.add('hidden');
};

let currentAuthTab = 'login';
window.switchAuthTab = function(tab) {
    currentAuthTab = tab;
    document.getElementById('tabLoginBtn').classList.toggle('active', tab === 'login');
    document.getElementById('tabRegisterBtn').classList.toggle('active', tab === 'register');
    document.getElementById('registerFields').classList.toggle('hidden', tab === 'login');
    document.getElementById('authSubmitBtn').textContent = tab === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد';
};

window.handleEmailAuth = async function(event) {
    event.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const errorEl = document.getElementById('authError');
    errorEl.classList.add('hidden');

    try {
        if (currentAuthTab === 'login') {
            await auth.signInWithEmailAndPassword(email, password);
        } else {
            const name = document.getElementById('authName').value.trim();
            const phone = document.getElementById('authPhone').value.trim();
            const role = document.getElementById('authRole').value;

            const res = await auth.createUserWithEmailAndPassword(email, password);
            await db.collection("users").doc(res.user.uid).set({
                uid: res.user.uid,
                email: email,
                name: name,
                phone: phone,
                role: role,
                isDriverApproved: false,
                isActive: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
        closeModal('loginModal');
    } catch (e) {
        errorEl.textContent = e.message;
        errorEl.classList.remove('hidden');
    }
};

window.handleGoogleSignIn = async function() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        await auth.signInWithPopup(provider);
        closeModal('loginModal');
    } catch (e) {
        alert("فشل تسجيل الدخول بحساب Google: " + e.message);
    }
};

window.handleLogout = async function() {
    await auth.signOut();
    switchView('homeView');
};

// ==================== BOOKING ACTIONS ====================
window.openBookingModal = function(tripId) {
    if (!currentUser) {
        openModal('loginModal');
        return;
    }
    currentBookingTrip = activeTrips.find(t => t.tripId === tripId);
    if (!currentBookingTrip) return;

    document.getElementById('bookingTripSummary').innerHTML = `
        <h4>${currentBookingTrip.fromCity} ← ${currentBookingTrip.toCity}</h4>
        <p>السعر للمقعد: <strong>${currentBookingTrip.price} دج</strong></p>
        <p>المقاعد المتاحة: <strong>${currentBookingTrip.availableSeats}</strong></p>
    `;
    openModal('bookingModal');
};

window.submitBooking = async function() {
    const seats = parseInt(document.getElementById('bookingSeatsInput').value) || 1;
    const errorEl = document.getElementById('bookingError');
    errorEl.classList.add('hidden');

    if (!currentBookingTrip) return;

    try {
        await db.runTransaction(async (transaction) => {
            const tripRef = db.collection("trips").doc(currentBookingTrip.tripId);
            const tripSnap = await transaction.get(tripRef);
            if (!tripSnap.exists) throw new Error("الرحلة غير موجودة");

            const tripData = tripSnap.data();
            if (tripData.availableSeats < seats) throw new Error("عدد المقاعد غير كافٍ");

            const newAvailable = tripData.availableSeats - seats;
            transaction.set(tripRef, { availableSeats: newAvailable, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });

            const newBookingRef = db.collection("bookings").doc();
            transaction.set(newBookingRef, {
                bookingId: newBookingRef.id,
                tripId: currentBookingTrip.tripId,
                driverId: currentBookingTrip.driverId,
                passengerId: currentUser.uid,
                passengerName: currentUserProfile ? currentUserProfile.name : "راكب",
                seatsBooked: seats,
                totalPrice: currentBookingTrip.price * seats,
                status: "pending",
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        alert("تم تأكيد الحجز بنجاح ✓");
        closeModal('bookingModal');
    } catch (e) {
        errorEl.textContent = e.message;
        errorEl.classList.remove('hidden');
    }
};

// ==================== DRIVER ACTIONS ====================
window.handleCreateTrip = async function(event) {
    event.preventDefault();
    if (!currentUser) return;

    const fromCity = document.getElementById('tripFromCity').value;
    const toCity = document.getElementById('tripToCity').value;
    const totalSeats = parseInt(document.getElementById('tripTotalSeats').value) || 4;
    const price = parseFloat(document.getElementById('tripPrice').value) || 1000;
    const notes = document.getElementById('tripNotes').value;

    try {
        const newTripRef = db.collection("trips").doc();
        await newTripRef.set({
            tripId: newTripRef.id,
            driverId: currentUser.uid,
            driverName: currentUserProfile ? currentUserProfile.name : "سائق",
            driverPhone: currentUserProfile ? (currentUserProfile.driverPhone || currentUserProfile.phone) : "",
            fromCity: fromCity,
            toCity: toCity,
            totalSeats: totalSeats,
            availableSeats: totalSeats,
            price: price,
            notes: notes,
            status: "active",
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert("تم نشر الرحلة بنجاح ✓");
        closeModal('addTripModal');
    } catch (e) {
        alert("فشل نشر الرحلة: " + e.message);
    }
};

window.handleCreateRequest = async function(event) {
    event.preventDefault();
    if (!currentUser) return;

    const fromCity = document.getElementById('reqFromCity').value;
    const toCity = document.getElementById('reqToCity').value;
    const seatsNeeded = parseInt(document.getElementById('reqSeatsNeeded').value) || 1;
    const notes = document.getElementById('reqNotes').value;

    try {
        const newReqRef = db.collection("ride_requests").doc();
        await newReqRef.set({
            requestId: newReqRef.id,
            passengerId: currentUser.uid,
            passengerName: currentUserProfile ? currentUserProfile.name : "راكب",
            passengerPhone: currentUserProfile ? currentUserProfile.phone : "",
            fromCity: fromCity,
            toCity: toCity,
            seatsNeeded: seatsNeeded,
            notes: notes,
            status: "open",
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert("تم إرسال طلب الرحلة بنجاح ✓");
        closeModal('requestRideModal');
    } catch (e) {
        alert("فشل إرسال الطلب: " + e.message);
    }
};

window.acceptRideRequest = async function(requestId) {
    if (!currentUser) return;
    try {
        await db.collection("ride_requests").doc(requestId).set({
            status: "accepted",
            acceptedByDriverId: currentUser.uid,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        alert("تم قبول الطلب. تواصل مع الراكب لتأكيد التفاصيل.");
    } catch (e) {
        alert("فشل قبول الطلب: " + e.message);
    }
};

// ==================== REVIEWS ACTIONS ====================
window.handleCreateReview = async function(event) {
    event.preventDefault();
    if (!currentUser) return;

    const rating = parseInt(document.getElementById('reviewRating').value) || 5;
    const comment = document.getElementById('reviewComment').value;

    try {
        const newRef = db.collection("reviews").doc();
        await newRef.set({
            reviewId: newRef.id,
            userId: currentUser.uid,
            userName: currentUserProfile ? currentUserProfile.name : "مستخدم",
            rating: rating,
            comment: comment,
            isVisible: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert("تم إرسال تقييمك بنجاح. شكراً لك! ✓");
        closeModal('addReviewModal');
    } catch (e) {
        alert("فشل إرسال التقييم: " + e.message);
    }
};

// ==================== ADMIN ACTIONS ====================
window.toggleDriverApproval = async function(uid, approved) {
    try {
        await db.collection("users").doc(uid).set({
            isDriverApproved: approved,
            driverApproved: approved,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        alert(approved ? "تم اعتماد السائق بنجاح ✓" : "تم إلغاء اعتماد السائق");
    } catch (e) {
        alert("فشلت العملية: " + e.message);
    }
};

window.toggleUserActiveStatus = async function(uid, active) {
    try {
        await db.collection("users").doc(uid).set({
            isActive: active,
            active: active,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        alert(active ? "تم تفعيل الحساب بنجاح ✓" : "تم تعطيل الحساب");
    } catch (e) {
        alert("فشلت العملية: " + e.message);
    }
};

window.toggleReviewVisibility = async function(reviewId, isVisible) {
    try {
        await db.collection("reviews").doc(reviewId).set({ isVisible: isVisible }, { merge: true });
        alert(isVisible ? "تم إظهار التقييم للعموم ✓" : "تم إخفاء التقييم عن العموم");
    } catch (e) {
        alert("فشلت العملية: " + e.message);
    }
};

window.deleteReview = async function(reviewId) {
    if (!confirm("هل أنت تأكد من إرادة حذف هذا التقييم نهائياً؟")) return;
    try {
        await db.collection("reviews").doc(reviewId).delete();
        alert("تم حذف التقييم بنجاح ✓");
    } catch (e) {
        alert("فشلت العملية: " + e.message);
    }
};

window.saveAdminSettings = async function() {
    const isMaintenanceMode = document.getElementById('setMaintenanceMode').checked;
    const maintenanceMessage = document.getElementById('setMaintenanceMessage').value.trim();
    const allowNewRegistrations = document.getElementById('setAllowRegistrations').checked;
    const allowNewTrips = document.getElementById('setAllowTrips').checked;

    try {
        await db.collection("app_settings").doc("general").set({
            isMaintenanceMode: isMaintenanceMode,
            maintenanceMessage: maintenanceMessage,
            allowNewRegistrations: allowNewRegistrations,
            allowNewTrips: allowNewTrips,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: currentUser ? currentUser.uid : ""
        }, { merge: true });

        alert("تم حفظ إعدادات المنظومة بنجاح ✓");
        closeModal('adminSettingsModal');
    } catch (e) {
        alert("فشل حفظ الإعدادات: " + e.message);
    }
};
