package za.co.shoplink.order.model;

import java.time.Instant;
import java.util.List;
import java.math.BigDecimal;
import com.fasterxml.jackson.annotation.JsonProperty;

public record Order(String id, String customerId, OrderStatus status, List<OrderItem> items, Instant createdAt) {
    public Order {
        items = List.copyOf(items);
    }
    @JsonProperty public BigDecimal subtotal() {
        return items.stream().map(i -> i.originalUnitPrice().multiply(BigDecimal.valueOf(i.quantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
    @JsonProperty public BigDecimal total() {
        return items.stream().map(i -> i.unitPrice().multiply(BigDecimal.valueOf(i.quantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
    @JsonProperty public BigDecimal discount() { return subtotal().subtract(total()); }
}
