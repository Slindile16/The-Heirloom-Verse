package za.co.shoplink.order.service;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import za.co.shoplink.order.dto.CreateOrderRequest.Selection;
import za.co.shoplink.order.model.Order;
import za.co.shoplink.order.model.OrderItem;
import za.co.shoplink.order.model.OrderStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Currency;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class CollectionOfferTest {
    private static OrderItem item(String variant, int quantity, String price) {
        return new OrderItem(variant, variant, quantity, new BigDecimal(price), Currency.getInstance("ZAR"));
    }
    private static Order order(List<OrderItem> items, Selection... selections) {
        return new Order("test", "demo", OrderStatus.PAYMENT_PENDING,
                CollectionOffer.apply(items, List.of(selections)), Instant.now());
    }
    private static void amount(String expected, BigDecimal actual) { assertEquals(0, new BigDecimal(expected).compareTo(actual)); }

    @Test void discountsOnlyEligibleItemsWithNoMinimumSpend() {
        Order order = order(List.of(item("HV190-J",1,"6900"),item("HV05-40cm",1,"8900"),item("HV02-J",1,"12800")),
                new Selection("dewdrop-ring","J",1),new Selection("golden-thread","40cm",1),new Selection("evermore-band","J",1));
        amount("28600",order.subtotal());amount("3160",order.discount());amount("25440",order.total());
    }
    @Test void repeatedSizesOfOneDesignDoNotUnlockDiscount() {
        Order order=order(List.of(item("HV190-J",2,"6900"),item("HV190-L",1,"6900")),
                new Selection("dewdrop-ring","J",2),new Selection("dewdrop-ring","L",1));
        amount("0",order.discount());
    }
    @Test void setComponentsRemainFullPriceEvenWhenTheSameDesignIsAlsoBoughtSeparately() {
        Order order=order(List.of(item("HV04-40cm",1,"14200"),item("HV08-Pair",1,"11500"),item("HV190-J",2,"6900"),item("HV05-40cm",1,"8900")),
                new Selection("first-light-diamond-suite","40cm|Pair|J",1),new Selection("dewdrop-ring","J",1),new Selection("golden-thread","40cm",1));
        amount("3160",order.discount());
        assertEquals(1,order.items().stream().filter(i->i.productId().equals("HV190-J")&&i.unitPrice().compareTo(i.originalUnitPrice())==0).mapToInt(OrderItem::quantity).sum());
    }
    @Test void setAndOneEligibleDesignDoNotUnlockDiscount() {
        Order order=order(List.of(item("HV04-40cm",1,"14200"),item("HV08-Pair",1,"11500"),item("HV190-J",1,"6900"),item("HV05-40cm",1,"8900")),
                new Selection("first-light-diamond-suite","40cm|Pair|J",1),new Selection("golden-thread","40cm",1));
        amount("0",order.discount());
    }
    @Test void rejectsForgedSelectionOrInvalidSize() {
        List<OrderItem> items=List.of(item("HV02-J",1,"12800"));
        assertThrows(ResponseStatusException.class,()->CollectionOffer.apply(items,List.of(new Selection("dewdrop-ring","J",1),new Selection("golden-thread","40cm",1))));
        assertThrows(ResponseStatusException.class,()->CollectionOffer.apply(items,List.of(new Selection("evermore-band","INVALID",1))));
    }
    @Test void legacyApiOrdersKeepTheirRegularPrice() {
        List<OrderItem> items=List.of(item("HV190-J",1,"6900"),item("HV05-40cm",1,"8900"));
        assertEquals(items,CollectionOffer.apply(items,null));
    }
    @Test void serializesReceiptTotals() throws Exception {
        Order order=order(List.of(item("HV190-J",1,"6900"),item("HV05-40cm",1,"8900")),new Selection("dewdrop-ring","J",1),new Selection("golden-thread","40cm",1));
        var json=new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules().valueToTree(order);
        amount("15800",json.path("subtotal").decimalValue());amount("3160",json.path("discount").decimalValue());amount("12640",json.path("total").decimalValue());
    }
}
