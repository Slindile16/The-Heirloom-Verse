package za.co.shoplink.order.service;

import org.junit.jupiter.api.Test;
import za.co.shoplink.order.client.*;
import za.co.shoplink.order.dto.*;
import za.co.shoplink.order.messaging.*;
import za.co.shoplink.order.model.OrderStatus;
import za.co.shoplink.order.repository.OrderRepository;
import za.co.shoplink.common.events.*;
import java.math.BigDecimal;
import java.util.Currency;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DiscountedOrderTest {
    @Test void paymentUsesDiscountedTotalAndPreservesSavingsAfterApproval() {
        var products=mock(ProductServiceClient.class);var inventory=mock(InventoryServiceClient.class);
        var publisher=mock(OrderCreatedPublisher.class);var workflow=mock(OrderWorkflowPublisher.class);
        var currency=Currency.getInstance("ZAR");
        when(products.findById("HV190-J")).thenReturn(new ProductDetails("HV190-J","Ring",new BigDecimal("6900"),currency));
        when(products.findById("HV05-40cm")).thenReturn(new ProductDetails("HV05-40cm","Necklace",new BigDecimal("8900"),currency));
        var service=new OrderService(new OrderRepository(),products,inventory,publisher,workflow,new OrderEventOutbox());
        var request=new CreateOrderRequest("demo",List.of(new CreateOrderRequest.Item("HV190-J",1),new CreateOrderRequest.Item("HV05-40cm",1)),
                List.of(new CreateOrderRequest.Selection("dewdrop-ring","J",1),new CreateOrderRequest.Selection("golden-thread","40cm",1)));
        var order=service.create(request);
        var event=org.mockito.ArgumentCaptor.forClass(OrderCreatedEvent.class);verify(publisher).publish(event.capture());
        assertEquals(0,event.getValue().amount().compareTo(new BigDecimal("12640")));
        assertThrows(IllegalArgumentException.class,()->service.applyPayment(new PaymentProcessedEvent("wrong",order.id(),new BigDecimal("15800"),currency,PaymentProcessedEvent.Status.APPROVED)));
        service.applyPayment(new PaymentProcessedEvent("approved",order.id(),new BigDecimal("12640"),currency,PaymentProcessedEvent.Status.APPROVED));
        var paid=service.findById(order.id());assertEquals(OrderStatus.PAID,paid.status());assertEquals(0,paid.discount().compareTo(new BigDecimal("3160")));
    }
}
