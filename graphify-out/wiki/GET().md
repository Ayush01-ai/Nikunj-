# GET()

> God node · 55 connections · [C:\Nikunj\src\app\api\webhooks\whatsapp\route.ts](file:///C:/Nikunj/src/app/api/webhooks/whatsapp/route.ts#L28)

## Call Trace Diagram

```mermaid
sequenceDiagram
    participant P0 as GET()
    participant P1 as POST()
    participant P2 as error
    participant P3 as PATCH()
    participant P4 as catch()
    participant P5 as run()
    participant P6 as verifyDelivery()
    participant P7 as sendApproved()
    participant P8 as pushOrderToSanity()
    participant P9 as requireAuthHybrid()
    participant P10 as sendDeliveryCode()
    participant P11 as recordOutcome()
    participant P12 as DELETE()
    participant P13 as settleCashfreeOrder()
    participant P14 as recordOrderPlaced()
    participant P15 as verifyOrderAccess()
    participant P16 as sendOrderWhatsApp()
    participant P17 as reconcileCashfreePayment()
    participant P18 as getSanityOrder()
    participant P19 as resyncOrderToSanity()
    participant P20 as withStockLock()
    participant P21 as sendDeliveryOtpWhatsApp()
    participant P22 as run()
    participant P23 as failApproved()
    participant P24 as setSanityUpiReference()
    participant P25 as sendWhatsAppOtp()
    participant P26 as addToCart()
    participant P27 as heldQuantities()
    participant P28 as sanityFetch()
    participant P29 as placeOrder()
    participant P30 as handleAddToCart()
    participant P31 as sendEmail()
    participant P32 as notifyCustomerOrderConfirmed()
    participant P33 as saveAddress()
    participant P34 as getServerSetOrderNote()
    participant P35 as validateCoupon()
    participant P36 as sendOtp()
    participant P37 as getSanityOrders()
    participant P38 as releaseStockHold()
    participant P39 as saveProfile()
    participant P40 as deleteAddress()
    participant P41 as setDefaultAddress()
    participant P42 as handleSubmit()
    participant P43 as onRequestError()
    participant P44 as json
    participant P45 as set()
    participant P46 as push
    participant P47 as from
    participant P48 as connectDB
    participant P49 as notifyOrder()
    participant P50 as now
    participant P51 as assignDelivery()
    participant P52 as digest()
    participant P53 as findOne
    participant P54 as ensureDeliveryCode()
    participant P55 as isRateLimited
    participant P56 as isIpLimited
    participant P57 as sanitizePhone()
    participant P58 as findOneAndUpdate
    participant P59 as sanityOrderId()
    participant P60 as parseAddress()
    participant P61 as text
    participant P62 as dayUpdateFor()
    participant P63 as isClerkConfigured()
    participant P64 as getClerkServerClient()
    participant P65 as getVariantPricing()
    participant P66 as syncMongo()
    participant P67 as requireAuthHybrid
    participant P68 as publicUser()
    participant P69 as lean()
    participant P70 as log()
    participant P71 as setSessionCookie()
    participant P72 as canSubmitPayoutDetails()
    participant P73 as requestEligibility()
    participant P74 as historyEntry()
    participant P75 as updateOne
    participant P76 as processRefund()
    participant P77 as refundView()
    participant P78 as fail()
    participant P79 as isOrderLimited
    participant P80 as validSignature()
    participant P81 as recordDayUpdate()
    participant P82 as syncAdminRole()
    participant P83 as sessionResponse()
    participant P84 as otpMatches()
    participant P85 as isStudioOrSiteAdmin()
    participant P86 as resendDeliveryCode()
    participant P87 as describePayout()
    participant P88 as getAdminSettings()
    participant P89 as daysSinceDelivered()
    participant P90 as verifyPaymentSignature()
    participant P91 as deliveryView()
    participant P92 as buildPaymentResponse()
    participant P93 as analyticsEnabled()
    participant P94 as parseTrackPayload()
    participant P95 as istDay()
    participant P96 as recordLead()
    participant P97 as ensureUserIndexes()
    participant P98 as isValidPhone()
    participant P99 as isWhatsAppConfigured
    participant P100 as studioCorsHeaders()
    participant P101 as orderTotals()
    participant P102 as deliveryPolicy()
    participant P103 as snapshotForOrder()
    participant P104 as validatePayoutDetails()
    participant P105 as isCashfreeConfigured
    participant P106 as createGuestPaymentProof()
    participant P107 as refundBreakdown()
    participant P108 as isLimited
    participant P109 as clean()
    participant P110 as imageExt()
    participant P111 as key()
    participant P112 as recoverExistingCashfreeOrder()
    participant P113 as providedSecret()
    participant P114 as safeEqual()
    participant P115 as validSecret()
    participant P116 as clientIp()
    participant P117 as normalizeEmail()
    participant P118 as isValidEmail()
    participant P119 as sendWhatsAppOtp
    participant P120 as holdKey()
    participant P121 as pushConfirmedOrderToSanity
    participant P122 as pushAwaitingPaymentOrderToSanity()
    participant P123 as done()
    participant P124 as isLeadRateLimited
    participant P125 as isTokenLimited
    participant P126 as plain()
    participant P127 as initialsOf()
    participant P128 as isOrderCreateLimited
    participant P129 as trustedBaseUrl()
    participant P130 as cashfreeCustomerId()
    participant P131 as isBot()
    participant P132 as comparePassword()
    participant P133 as passwordProblem()
    participant P134 as hashPassword()
    participant P135 as generateOTP()
    participant P136 as isDbConnectionError()
    participant P137 as authorizeOrderForPayment()
    participant P138 as createCashfreeOrder
    participant P139 as verifyCashfreeWebhookSignature
    participant P140 as revalidatePath
    participant P141 as Boolean()
    participant P142 as max
    participant P143 as verifySanityStudioToken()
    participant P144 as pickDiverse()
    participant P145 as track()
    participant P146 as safeEq()
    participant P147 as isEmailConfigured()
    participant P148 as uploadImageFromUrl()
    participant P149 as isGoogleConfigured()
    participant P150 as safeEqual()
    participant P151 as getSanityOrderStatuses()
    participant P152 as LegacyProductsPage()
    participant P153 as extractToken()
    participant P154 as summariseDays()
    participant P155 as summariseProducts()
    participant P156 as filterAndSort()
    participant P157 as safeNext()
    participant P158 as siteUrl()
    participant P159 as limit
    P0->>+ P1: calls
    P1-->>- P0: return
    P1->>+ P0: calls
    P0-->>- P1: return
    P1->>+ P2: calls
    P2-->>- P1: return
    P2->>+ P1: calls
    P1-->>- P2: return
    P2->>+ P0: calls
    P0-->>- P2: return
    P2->>+ P3: calls
    P3-->>- P2: return
    P2->>+ P4: calls
    P4-->>- P2: return
    P2->>+ P5: calls
    P5-->>- P2: return
    P2->>+ P6: calls
    P6-->>- P2: return
    P2->>+ P7: calls
    P7-->>- P2: return
    P2->>+ P8: calls
    P8-->>- P2: return
    P2->>+ P9: calls
    P9-->>- P2: return
    P2->>+ P10: calls
    P10-->>- P2: return
    P2->>+ P11: calls
    P11-->>- P2: return
    P2->>+ P12: calls
    P12-->>- P2: return
    P2->>+ P13: calls
    P13-->>- P2: return
    P2->>+ P14: calls
    P14-->>- P2: return
    P2->>+ P15: calls
    P15-->>- P2: return
    P2->>+ P16: calls
    P16-->>- P2: return
    P2->>+ P17: calls
    P17-->>- P2: return
    P2->>+ P18: calls
    P18-->>- P2: return
    P2->>+ P19: calls
    P19-->>- P2: return
    P2->>+ P20: calls
    P20-->>- P2: return
    P2->>+ P21: calls
    P21-->>- P2: return
    P2->>+ P22: calls
    P22-->>- P2: return
    P2->>+ P23: calls
    P23-->>- P2: return
    P2->>+ P24: calls
    P24-->>- P2: return
    P2->>+ P25: calls
    P25-->>- P2: return
    P2->>+ P26: calls
    P26-->>- P2: return
    P2->>+ P27: calls
    P27-->>- P2: return
    P2->>+ P28: calls
    P28-->>- P2: return
    P2->>+ P29: calls
    P29-->>- P2: return
    P2->>+ P30: calls
    P30-->>- P2: return
    P2->>+ P31: calls
    P31-->>- P2: return
    P2->>+ P32: calls
    P32-->>- P2: return
    P2->>+ P33: calls
    P33-->>- P2: return
    P2->>+ P34: calls
    P34-->>- P2: return
    P2->>+ P35: calls
    P35-->>- P2: return
    P2->>+ P36: calls
    P36-->>- P2: return
    P2->>+ P37: calls
    P37-->>- P2: return
    P2->>+ P38: calls
    P38-->>- P2: return
    P2->>+ P39: calls
    P39-->>- P2: return
    P2->>+ P40: calls
    P40-->>- P2: return
    P2->>+ P41: calls
    P41-->>- P2: return
    P2->>+ P42: calls
    P42-->>- P2: return
    P2->>+ P43: calls
    P43-->>- P2: return
    P1->>+ P3: calls
    P3-->>- P1: return
    P1->>+ P4: calls
    P4-->>- P1: return
    P1->>+ P44: calls
    P44-->>- P1: return
    P1->>+ P45: calls
    P45-->>- P1: return
    P1->>+ P46: calls
    P46-->>- P1: return
    P1->>+ P47: calls
    P47-->>- P1: return
    P1->>+ P48: calls
    P48-->>- P1: return
    P1->>+ P49: calls
    P49-->>- P1: return
    P1->>+ P50: calls
    P50-->>- P1: return
    P1->>+ P51: calls
    P51-->>- P1: return
    P1->>+ P6: calls
    P6-->>- P1: return
    P1->>+ P52: calls
    P52-->>- P1: return
    P1->>+ P53: calls
    P53-->>- P1: return
    P1->>+ P54: calls
    P54-->>- P1: return
    P1->>+ P13: calls
    P13-->>- P1: return
    P1->>+ P55: calls
    P55-->>- P1: return
    P1->>+ P56: calls
    P56-->>- P1: return
    P1->>+ P57: calls
    P57-->>- P1: return
    P1->>+ P58: calls
    P58-->>- P1: return
    P1->>+ P15: calls
    P15-->>- P1: return
    P1->>+ P59: calls
    P59-->>- P1: return
    P1->>+ P20: calls
    P20-->>- P1: return
    P1->>+ P18: calls
    P18-->>- P1: return
    P1->>+ P19: calls
    P19-->>- P1: return
    P1->>+ P60: calls
    P60-->>- P1: return
    P1->>+ P61: calls
    P61-->>- P1: return
    P1->>+ P62: calls
    P62-->>- P1: return
    P1->>+ P63: calls
    P63-->>- P1: return
    P1->>+ P64: calls
    P64-->>- P1: return
    P1->>+ P65: calls
    P65-->>- P1: return
    P1->>+ P24: calls
    P24-->>- P1: return
    P1->>+ P66: calls
    P66-->>- P1: return
    P1->>+ P67: calls
    P67-->>- P1: return
    P1->>+ P68: calls
    P68-->>- P1: return
    P1->>+ P69: calls
    P69-->>- P1: return
    P1->>+ P70: calls
    P70-->>- P1: return
    P1->>+ P71: calls
    P71-->>- P1: return
    P1->>+ P72: calls
    P72-->>- P1: return
    P1->>+ P73: calls
    P73-->>- P1: return
    P1->>+ P74: calls
    P74-->>- P1: return
    P1->>+ P75: calls
    P75-->>- P1: return
    P1->>+ P76: calls
    P76-->>- P1: return
    P1->>+ P77: calls
    P77-->>- P1: return
    P1->>+ P78: calls
    P78-->>- P1: return
    P1->>+ P79: calls
    P79-->>- P1: return
    P1->>+ P80: calls
    P80-->>- P1: return
    P1->>+ P81: calls
    P81-->>- P1: return
    P1->>+ P82: calls
    P82-->>- P1: return
    P1->>+ P83: calls
    P83-->>- P1: return
    P1->>+ P84: calls
    P84-->>- P1: return
    P1->>+ P85: calls
    P85-->>- P1: return
    P1->>+ P86: calls
    P86-->>- P1: return
    P1->>+ P87: calls
    P87-->>- P1: return
    P1->>+ P88: calls
    P88-->>- P1: return
    P1->>+ P89: calls
    P89-->>- P1: return
    P1->>+ P90: calls
    P90-->>- P1: return
    P1->>+ P91: calls
    P91-->>- P1: return
    P1->>+ P32: calls
    P32-->>- P1: return
    P1->>+ P92: calls
    P92-->>- P1: return
    P1->>+ P34: calls
    P34-->>- P1: return
    P1->>+ P93: calls
    P93-->>- P1: return
    P1->>+ P94: calls
    P94-->>- P1: return
    P1->>+ P95: calls
    P95-->>- P1: return
    P1->>+ P96: calls
    P96-->>- P1: return
    P1->>+ P97: calls
    P97-->>- P1: return
    P1->>+ P98: calls
    P98-->>- P1: return
    P1->>+ P99: calls
    P99-->>- P1: return
    P1->>+ P100: calls
    P100-->>- P1: return
    P1->>+ P101: calls
    P101-->>- P1: return
    P1->>+ P102: calls
    P102-->>- P1: return
    P1->>+ P103: calls
    P103-->>- P1: return
    P1->>+ P104: calls
    P104-->>- P1: return
    P1->>+ P105: calls
    P105-->>- P1: return
    P1->>+ P106: calls
    P106-->>- P1: return
    P1->>+ P107: calls
    P107-->>- P1: return
    P1->>+ P108: calls
    P108-->>- P1: return
    P1->>+ P109: calls
    P109-->>- P1: return
    P1->>+ P110: calls
    P110-->>- P1: return
    P1->>+ P111: calls
    P111-->>- P1: return
    P1->>+ P112: calls
    P112-->>- P1: return
    P1->>+ P113: calls
    P113-->>- P1: return
    P1->>+ P114: calls
    P114-->>- P1: return
    P1->>+ P115: calls
    P115-->>- P1: return
    P1->>+ P116: calls
    P116-->>- P1: return
    P1->>+ P117: calls
    P117-->>- P1: return
    P1->>+ P118: calls
    P118-->>- P1: return
    P1->>+ P119: calls
    P119-->>- P1: return
    P1->>+ P120: calls
    P120-->>- P1: return
    P1->>+ P121: calls
    P121-->>- P1: return
    P1->>+ P122: calls
    P122-->>- P1: return
    P1->>+ P123: calls
    P123-->>- P1: return
    P1->>+ P124: calls
    P124-->>- P1: return
    P1->>+ P125: calls
    P125-->>- P1: return
    P1->>+ P126: calls
    P126-->>- P1: return
    P1->>+ P127: calls
    P127-->>- P1: return
    P1->>+ P128: calls
    P128-->>- P1: return
    P1->>+ P129: calls
    P129-->>- P1: return
    P1->>+ P130: calls
    P130-->>- P1: return
    P1->>+ P131: calls
    P131-->>- P1: return
    P1->>+ P132: calls
    P132-->>- P1: return
    P1->>+ P133: calls
    P133-->>- P1: return
    P1->>+ P134: calls
    P134-->>- P1: return
    P1->>+ P135: calls
    P135-->>- P1: return
    P1->>+ P136: calls
    P136-->>- P1: return
    P1->>+ P137: calls
    P137-->>- P1: return
    P1->>+ P138: calls
    P138-->>- P1: return
    P1->>+ P139: calls
    P139-->>- P1: return
    P1->>+ P140: calls
    P140-->>- P1: return
    P0->>+ P2: calls
    P2-->>- P0: return
    P0->>+ P44: calls
    P44-->>- P0: return
    P0->>+ P45: calls
    P45-->>- P0: return
    P0->>+ P141: calls
    P141-->>- P0: return
    P0->>+ P47: calls
    P47-->>- P0: return
    P0->>+ P142: calls
    P142-->>- P0: return
    P0->>+ P48: calls
    P48-->>- P0: return
    P0->>+ P5: calls
    P5-->>- P0: return
    P0->>+ P53: calls
    P53-->>- P0: return
    P0->>+ P12: calls
    P12-->>- P0: return
    P0->>+ P143: calls
    P143-->>- P0: return
    P0->>+ P61: calls
    P61-->>- P0: return
    P0->>+ P63: calls
    P63-->>- P0: return
    P0->>+ P71: calls
    P71-->>- P0: return
    P0->>+ P67: calls
    P67-->>- P0: return
    P0->>+ P68: calls
    P68-->>- P0: return
    P0->>+ P69: calls
    P69-->>- P0: return
    P0->>+ P27: calls
    P27-->>- P0: return
    P0->>+ P144: calls
    P144-->>- P0: return
    P0->>+ P145: calls
    P145-->>- P0: return
    P0->>+ P146: calls
    P146-->>- P0: return
    P0->>+ P78: calls
    P78-->>- P0: return
    P0->>+ P82: calls
    P82-->>- P0: return
    P0->>+ P147: calls
    P147-->>- P0: return
    P0->>+ P88: calls
    P88-->>- P0: return
    P0->>+ P85: calls
    P85-->>- P0: return
    P0->>+ P148: calls
    P148-->>- P0: return
    P0->>+ P97: calls
    P97-->>- P0: return
    P0->>+ P99: calls
    P99-->>- P0: return
    P0->>+ P37: calls
    P37-->>- P0: return
    P0->>+ P100: calls
    P100-->>- P0: return
    P0->>+ P149: calls
    P149-->>- P0: return
    P0->>+ P113: calls
    P113-->>- P0: return
    P0->>+ P150: calls
    P150-->>- P0: return
    P0->>+ P151: calls
    P151-->>- P0: return
    P0->>+ P152: calls
    P152-->>- P0: return
    P0->>+ P153: calls
    P153-->>- P0: return
    P0->>+ P116: calls
    P116-->>- P0: return
    P0->>+ P154: calls
    P154-->>- P0: return
    P0->>+ P155: calls
    P155-->>- P0: return
    P0->>+ P156: calls
    P156-->>- P0: return
    P0->>+ P157: calls
    P157-->>- P0: return
    P0->>+ P158: calls
    P158-->>- P0: return
    P0->>+ P159: calls
    P159-->>- P0: return
```

## Connections by Relation

### QUERIES_MODEL
- [[Order]] `EXTRACTED`
- [[User]] `EXTRACTED`

### calls
- [[POST()]] `EXTRACTED`
- [[error]] `INFERRED`
- [[json]] `INFERRED`
- [[set()]] `INFERRED`
- [[Boolean()]] `INFERRED`
- [[from]] `INFERRED`
- [[max]] `INFERRED`
- [[connectDB]] `INFERRED`
- [[run()]] `INFERRED`
- [[findOne]] `INFERRED`
- [[DELETE()]] `INFERRED`
- [[verifySanityStudioToken()]] `INFERRED`
- [[text]] `INFERRED`
- [[isClerkConfigured()]] `INFERRED`
- [[setSessionCookie()]] `INFERRED`
- [[requireAuthHybrid]] `INFERRED`
- [[publicUser()]] `INFERRED`
- [[lean()]] `INFERRED`
- [[heldQuantities()]] `INFERRED`
- [[pickDiverse()]] `INFERRED`

### contains
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*